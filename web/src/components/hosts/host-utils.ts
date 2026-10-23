import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, put } from '@/api/client'
import { queryKeys, useTestHost } from '@/api/queries'
import type { Host, HostPayload, Metric } from '@/api/types'
import type { Tone } from '@/components/ui/badge'
import { hostState, type HostState } from '@/lib/calls'

/** 与后端 hostmanager.normalizeTags 对齐：最多 16 个标签，每个至多 32 个 Unicode 字符 */
export const MAX_TAGS = 16
export const MAX_TAG_LENGTH = 32

/**
 * 后端 hostmanager.normalizeTags 走 Go 的 strings.ToLower：逐 rune 的 simple 小写映射。
 * JS 的 toLowerCase 对整串按完整 Unicode 规则来，还会看上下文——`ΟΣ` 的词尾 Σ 落成 ς，
 * `ΟΣ` 与 `οσ` 于是拿到两个不同的键，前端判重就和后端不是同一套规则了。
 * 所以逐 code point 单独取小写切断上下文（Σ 恒为 σ），再对「单个 code point 被展开成多个」
 * 的情况只保留首个（`İ` → `i` + U+0307，Go 只映射到 `i`），结果正好等于 simple 映射。
 */
const simpleLowerKey = (tag: string) => {
  let key = ''
  for (const ch of tag) {
    const lower = ch.toLowerCase()
    if (lower.length === ch.length) {
      key += lower
      continue
    }
    // 按 code point 解构，取首个映射；代理对不会被劈成半个字符
    const [head] = lower
    key += head
  }
  return key
}

/** 按上面那把小写键去重、保留首次出现的拼写，与后端 normalizeTags 判定同一批标签重复 */
export const dedupeTags = (tags: string[]) => {
  const seen = new Set<string>()
  return tags.filter((tag) => {
    const key = simpleLowerKey(tag)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 主机状态 → 状态色：在线绿、离线红，其余中性（未连接 / 待采样不是故障） */
export const STATE_TONE: Record<HostState, Tone> = { online: 'ok', offline: 'bad', sampling: 'neutral', unknown: 'neutral' }

/**
 * 从列表视图还原一份「整体替换」的 PUT 载荷：后端对省略字段的语义是清除，
 * 所以标签、跳板、密钥 id 都要原样带回；密码省略即「不修改」。
 */
export function payloadFromHost(host: Host, hosts: Host[], patch: Partial<HostPayload> = {}): HostPayload {
  return {
    name: host.name,
    username: host.username,
    addr: host.addr,
    port: host.port,
    auth_type: host.auth_type,
    key_id: host.auth_type === 'key' ? host.key_id : undefined,
    jump_host: hosts.find((item) => item.id === host.jump_host_id)?.name,
    monitor_enabled: host.monitor_enabled,
    tags: host.tags,
    ...patch,
  }
}

/** 沿 jump_host_id 往上走出完整跳板链（近 → 远），最多 5 级、遇环即止 */
export function jumpChain(host: Host, byId: Map<number, Host>): Host[] {
  const chain: Host[] = []
  const seen = new Set([host.id])
  let current = host.jump_host_id ? byId.get(host.jump_host_id) : undefined
  while (current && !seen.has(current.id) && chain.length < 5) {
    chain.unshift(current)
    seen.add(current.id)
    current = current.jump_host_id ? byId.get(current.jump_host_id) : undefined
  }
  return chain
}

/** 一批主机的最近 1 小时指标：与概览共用同一份缓存 key，切页不重复拉 */
export function useHostMetrics(hosts: Host[]) {
  const monitored = hosts.filter((host) => host.monitor_enabled)
  const results = useQueries({
    queries: monitored.map((host) => ({
      queryKey: queryKeys.metrics(host.id, 1),
      queryFn: () => api<Metric[]>(`/metrics/${host.id}?hours=1`),
      refetchInterval: 30_000,
    })),
  })
  const map = new Map<number, Metric[]>()
  monitored.forEach((host, index) => map.set(host.id, results[index]?.data ?? []))
  return map
}

export const latestOf = (series?: Metric[]) => (series && series.length ? series[series.length - 1] : undefined)

export function stateOf(host: Host, series?: Metric[]) {
  return hostState(host, latestOf(series))
}

/**
 * 监控开关：乐观更新——开关先动、请求后到，失败回滚并提示。
 * 列表与详情共用，所以写成独立 mutation 而不是绑定某个 id 的 useSaveHost。
 */
export function useToggleMonitor(hosts: Host[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ host, enabled }: { host: Host; enabled: boolean }) =>
      put<Host>(`/hosts/${host.id}`, payloadFromHost(host, hosts, { monitor_enabled: enabled })),
    onMutate: async ({ host, enabled }) => {
      await qc.cancelQueries({ queryKey: queryKeys.hosts })
      const previous = qc.getQueryData<Host[]>(queryKeys.hosts)
      qc.setQueryData<Host[]>(queryKeys.hosts, (list) =>
        list?.map((item) => (item.id === host.id ? { ...item, monitor_enabled: enabled } : item)),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.hosts, context.previous)
      toast.error((error as Error).message)
    },
    onSuccess: (_data, { host, enabled }) => {
      toast.success(`${host.name} 资源监控已${enabled ? '开启' : '关闭'}`, {
        description: enabled ? '下一轮采样后出现曲线' : '已采集的数据保留 7 天',
      })
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.hosts }),
  })
}

/**
 * 测试连接：单台走 toast.promise 承担 loading / 成功 / 失败三态；
 * 「全部测试」静默并发（4 路），结束后汇总成一条 toast。进行中的主机 id 单独记，
 * 一个 mutation 实例只认最后一次调用，按行显示 loading 要靠这份集合。
 */
export function useHostTest() {
  const testHost = useTestHost()
  const [testing, setTesting] = useState<ReadonlySet<number>>(new Set())

  const run = async (host: Host) => {
    setTesting((prev) => new Set(prev).add(host.id))
    try {
      return await testHost.mutateAsync(host.id)
    } finally {
      setTesting((prev) => {
        const next = new Set(prev)
        next.delete(host.id)
        return next
      })
    }
  }

  const test = (host: Host) => {
    const request = run(host)
    toast.promise(request, {
      loading: `正在连接 ${host.name}…`,
      success: (result) => ({ message: `${host.name} 连接正常`, description: result.output?.trim() || undefined }),
      error: (error) => ({ message: `${host.name} 连接失败`, description: (error as Error).message }),
    })
    return request.then(
      () => true,
      () => false,
    )
  }

  const testAll = async (hosts: Host[]) => {
    const failures: { host: Host; message: string }[] = []
    const queue = [...hosts]
    const worker = async () => {
      for (let host = queue.shift(); host; host = queue.shift()) {
        try {
          await run(host)
        } catch (error) {
          failures.push({ host, message: (error as Error).message })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, hosts.length) }, worker))
    const ok = hosts.length - failures.length
    if (failures.length === 0) toast.success(`${ok} 台主机连接正常`)
    else
      toast.warning(`${ok} 台正常，${failures.length} 台无法连接`, {
        description: failures
          .slice(0, 3)
          .map((f) => `${f.host.name}：${f.message}`)
          .join('\n'),
        duration: 7000,
      })
  }

  return { test, testAll, testing }
}

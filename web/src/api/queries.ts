import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, del, post, put, uploadFile } from './client'
import type {
  Audit,
  CommandOutputChunk,
  CommandRun,
  FileEntry,
  GatewayInfo,
  Host,
  HostPayload,
  JobStatus,
  KeyPayload,
  MemoryBankStat,
  MemoryRow,
  Metric,
  Overview,
  SSHKey,
  Token,
  TokenPayload,
  ToolGroup,
} from './types'

export const queryKeys = {
  hosts: ['hosts'] as const,
  keys: ['keys'] as const,
  tokens: ['tokens'] as const,
  toolGroups: ['tool-groups'] as const,
  jobs: ['jobs'] as const,
  jobLogs: (id: string) => ['jobs', id, 'logs'] as const,
  audit: (filter: AuditFilter) => ['audit', filter] as const,
  auditTools: ['audit', 'tools'] as const,
  commandRuns: (filter: CommandRunFilter) => ['command-runs', 'list', filter] as const,
  commandRun: (id: string) => ['command-runs', 'detail', id] as const,
  commandOutput: (id: string, stream: string) => ['command-runs', 'output', id, stream] as const,
  metrics: (hostId: number, hours: number) => ['metrics', hostId, hours] as const,
  sftp: (hostId: number, path: string) => ['sftp', hostId, path] as const,
  /** 记忆列表与统计共用 ['memories'] 前缀：删除后一次前缀失效即可覆盖所有筛选与翻页缓存 */
  memories: ['memories'] as const,
  memoryList: (hostId: number | 'all', q: string, limit: number, offset: number) =>
    ['memories', 'list', hostId, q, limit, offset] as const,
  memoryStats: ['memories', 'stats'] as const,
  overview: (hours: number) => ['overview', hours] as const,
  info: ['info'] as const,
}

/** 所有 mutation 的统一失败提示；成功提示由调用方按语义给 */
const onError = (e: unknown) => toast.error((e as Error).message)

/** mutation 收敛：成功后失效指定 key + 弹成功 toast */
function useInvalidatingMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  key: readonly unknown[],
  successText?: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (successText) toast.success(successText)
      void qc.invalidateQueries({ queryKey: key })
    },
    onError,
  })
}

/**
 * 批量操作收敛：后端没有批量端点，循环单条接口。逐条顺序执行而不是 allSettled 并发——
 * 这些都是破坏性写操作，一次打满并发会给网关和远端造成尖峰，出错时也说不清做到了哪一步；
 * 顺序执行下失败列表与实际执行顺序一致。resolve 值是失败的 id 列表，调用方可据此保留选中项以便重试。
 */
function useBatchMutation<TId>(
  fn: (id: TId) => Promise<unknown>,
  key: readonly unknown[],
  verb: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: TId[]) => {
      const failedIds: TId[] = []
      let firstError: unknown
      for (const id of ids) {
        try {
          await fn(id)
        } catch (error) {
          failedIds.push(id)
          firstError ??= error
        }
      }
      return { failedIds, firstError }
    },
    onSuccess: ({ failedIds, firstError }, ids) => {
      const ok = ids.length - failedIds.length
      if (failedIds.length === 0) toast.success(`已${verb} ${ok} 项`)
      else if (ok === 0) toast.error(`${verb}失败：${(firstError as Error)?.message ?? '未知错误'}`)
      else toast.warning(`已${verb} ${ok} 项，${failedIds.length} 项失败`)
      void qc.invalidateQueries({ queryKey: key })
    },
    onError,
  })
}

/* ── 查询 ───────────────────────────────────────────────────────── */

/** 列表里带连通状态（health），状态由监控采样与命令执行刷新，这里 30s 拉一次足够 */
export const useHosts = () =>
  useQuery({ queryKey: queryKeys.hosts, queryFn: () => api<Host[]>('/hosts'), refetchInterval: 30_000 })

export const useKeys = () =>
  useQuery({ queryKey: queryKeys.keys, queryFn: () => api<SSHKey[]>('/keys') })

export const useTokens = () =>
  useQuery({ queryKey: queryKeys.tokens, queryFn: () => api<Token[]>('/tokens') })

/**
 * 任务列表。live=true（任务页）时后端会逐个 SSH 核对运行中任务的真实状态，4s 轮询；
 * live=false（侧栏、概览只要计数）只读库里的记录，不打扰远端主机，job_status 事件会触发失效。
 */
export const useJobs = ({ live = true }: { live?: boolean } = {}) =>
  useQuery({
    queryKey: [...queryKeys.jobs, live ? 'live' : 'snapshot'],
    queryFn: () => api<JobStatus[]>(live ? '/jobs' : '/jobs?refresh=0'),
    refetchInterval: live ? 4000 : 30_000,
  })

export const useJobLogs = (id: string, running: boolean) =>
  useInfiniteQuery({
    queryKey: queryKeys.jobLogs(id),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        offset_bytes: String(pageParam),
        limit_bytes: String(128 << 10),
      })
      return api<CommandOutputChunk>(`/jobs/${id}/logs?${params}`)
    },
    initialPageParam: 0,
    getNextPageParam: (last) => (last.complete ? undefined : last.next_offset_bytes),
    enabled: id !== '',
    retry: false,
    refetchInterval: running ? 2000 : false,
  })

/**
 * 审计筛选：缺省即不过滤；tool/token/host 支持多值（OR）。
 * ok 与 denied 组合表达结果：成功 = ok；拒绝 = denied；失败（非拒绝）= !ok && !denied。
 */
export type AuditFilter = {
  tool?: string[]
  token?: number[]
  host?: string[]
  ok?: boolean
  denied?: boolean
  limit?: number
}

export const useAudit = (filter: AuditFilter = {}) =>
  useQuery({
    queryKey: queryKeys.audit(filter),
    queryFn: () => {
      // 重复参数而不是逗号拼接：主机名允许含逗号，拼起来后端拆不回来
      const params = new URLSearchParams({ limit: String(filter.limit ?? 100) })
      for (const tool of filter.tool ?? []) params.append('tool', tool)
      for (const token of filter.token ?? []) params.append('token', String(token))
      for (const host of filter.host ?? []) params.append('host', host)
      if (filter.ok != null) params.set('ok', String(filter.ok))
      if (filter.denied != null) params.set('denied', String(filter.denied))
      return api<Audit[]>(`/audit?${params}`)
    },
    // 切换筛选时旧数据留在原位渐隐，避免每改一个条件表格就塌成骨架屏
    placeholderData: keepPreviousData,
    // 新调用由实时事件流触发失效重拉（见 LiveProvider）；这里只留一个兜底的慢轮询，防 SSE 断线漏数据
    refetchInterval: 30_000,
  })

/** 概览聚合统计：实时事件会节流触发失效，这里的轮询只是兜底 */
export const useOverview = (hours = 24) =>
  useQuery({
    queryKey: queryKeys.overview(hours),
    queryFn: () => api<Overview>(`/overview?hours=${hours}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })

/** 网关版本与启动时间：进程生命周期内不变 */
export const useInfo = () =>
  useQuery({ queryKey: queryKeys.info, queryFn: () => api<GatewayInfo>('/info'), staleTime: Infinity })

/**
 * 工具名全集：审计列表只回最近 100 条，从中累积出的选项会漏掉更早出现过的工具，
 * 于是有了独立端点。工具集合是部署期固定的，缓存久一点避免每次进页面都拉。
 */
export const useAuditTools = () =>
  useQuery({
    queryKey: queryKeys.auditTools,
    queryFn: () => api<string[]>('/audit/tools'),
    staleTime: 5 * 60_000,
  })

/** 命令执行列表筛选：多值为 OR；q 对命令文本做子串匹配 */
export type CommandRunFilter = {
  host?: string[]
  token?: number[]
  tool?: string[]
  status?: CommandRun['status'][]
  q?: string
  limit?: number
}

/** 命令执行列表：命令开始 / 结束事件会触发失效重拉，轮询只兜底 */
export const useCommandRuns = (filter: CommandRunFilter = {}, enabled = true) =>
  useQuery({
    queryKey: queryKeys.commandRuns(filter),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(filter.limit ?? 50) })
      for (const host of filter.host ?? []) params.append('host', host)
      for (const token of filter.token ?? []) params.append('token', String(token))
      for (const tool of filter.tool ?? []) params.append('tool', tool)
      for (const status of filter.status ?? []) params.append('status', status)
      if (filter.q) params.set('q', filter.q)
      return api<CommandRun[]>(`/command-runs?${params}`)
    },
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

export const useCommandRun = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.commandRun(id ?? ''),
    queryFn: () => api<CommandRun>(`/command-runs/${id}`),
    enabled: id != null,
    refetchInterval: (query) =>
      (query.state.data as CommandRun | undefined)?.status === 'running' ? 2000 : false,
  })

export const useCommandOutput = (
  id: string,
  stream: 'stdout' | 'stderr' | 'combined',
  enabled: boolean,
  running: boolean,
) =>
  useInfiniteQuery({
    queryKey: queryKeys.commandOutput(id, stream),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        stream,
        offset_bytes: String(pageParam),
        limit_bytes: String(128 << 10),
      })
      return api<CommandOutputChunk>(`/command-runs/${id}/output?${params}`)
    },
    initialPageParam: 0,
    getNextPageParam: (last) => (last.complete ? undefined : last.next_offset_bytes),
    enabled,
    retry: false,
    refetchInterval: running ? 2000 : false,
  })

export const useMetrics = (hostId: number | undefined, hours: number) =>
  useQuery({
    queryKey: queryKeys.metrics(hostId ?? 0, hours),
    queryFn: () => api<Metric[]>(`/metrics/${hostId}?hours=${hours}`),
    enabled: hostId != null,
  })

export const useSftpList = (hostId: number | undefined, path: string) =>
  useQuery({
    queryKey: queryKeys.sftp(hostId ?? 0, path),
    queryFn: () => api<FileEntry[]>(`/sftp/${hostId}/list?path=${encodeURIComponent(path)}`),
    enabled: hostId != null,
    retry: false,
  })

/** hostId 缺省 = 全部记忆库，0 = 全局库，其余 = 该主机库 */
export type MemoryFilter = { hostId?: number; q?: string; limit?: number; offset?: number }

/**
 * 翻页与搜索沿用上一页数据（keepPreviousData）：记忆列表是阅读型页面，
 * 每改一次筛选就整块塌成骨架屏会让人丢失阅读位置，改为原地渐隐更稳。
 */
export const useMemories = ({ hostId, q = '', limit = 50, offset = 0 }: MemoryFilter = {}) =>
  useQuery({
    queryKey: queryKeys.memoryList(hostId ?? 'all', q, limit, offset),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
      if (hostId != null) params.set('host_id', String(hostId))
      if (q) params.set('q', q)
      return api<MemoryRow[]>(`/memories?${params}`)
    },
    placeholderData: keepPreviousData,
  })

export const useMemoryStats = () =>
  useQuery({ queryKey: queryKeys.memoryStats, queryFn: () => api<MemoryBankStat[]>('/memories/stats') })

/* ── 主机 ───────────────────────────────────────────────────────── */

export const useSaveHost = (id?: number) =>
  useInvalidatingMutation<HostPayload, Host>(
    (v) => (id ? put<Host>(`/hosts/${id}`, v) : post<Host>('/hosts', v)),
    queryKeys.hosts,
    '主机已保存',
  )

export const useDeleteHost = () =>
  useInvalidatingMutation<number, void>((id) => del(`/hosts/${id}`), queryKeys.hosts, '主机已删除')

export const useDeleteHosts = () =>
  useBatchMutation<number>((id) => del(`/hosts/${id}`), queryKeys.hosts, '删除')

export const useResetFingerprint = () =>
  useInvalidatingMutation<number, unknown>(
    (id) => post(`/hosts/${id}/reset-fingerprint`, {}),
    queryKeys.hosts,
    '指纹已重置',
  )

/**
 * 测试连接不改配置，但会刷新连接池里的连通状态，结束后重拉主机列表让在线点跟上。
 * 失败提示由调用方的 toast.promise 承担，故不走统一 onError。
 */
export function useTestHost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => post<{ output?: string }>(`/hosts/${id}/test`, {}),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.hosts }),
  })
}

/* ── 密钥 / 令牌 / 任务 ─────────────────────────────────────────── */

export const useCreateKey = () =>
  useInvalidatingMutation<KeyPayload, SSHKey>((v) => post<SSHKey>('/keys', v), queryKeys.keys, '密钥已创建')

export const useDeleteKey = () =>
  useInvalidatingMutation<number, void>((id) => del(`/keys/${id}`), queryKeys.keys, '密钥已删除')

export const useDeleteKeys = () =>
  useBatchMutation<number>((id) => del(`/keys/${id}`), queryKeys.keys, '删除')

export const useCreateToken = () =>
  useInvalidatingMutation<TokenPayload, Token>((v) => post<Token>('/tokens', v), queryKeys.tokens)

export const useUpdateToken = () =>
  useInvalidatingMutation<{ id: number; payload: TokenPayload }, Token>(
    ({ id, payload }) => put<Token>(`/tokens/${id}`, payload),
    queryKeys.tokens,
    '令牌已更新',
  )

export const useToolGroups = () =>
  useQuery({ queryKey: queryKeys.toolGroups, queryFn: () => api<ToolGroup[]>('/tool-groups'), staleTime: Infinity })

export const useDeleteToken = () =>
  useInvalidatingMutation<number, void>((id) => del(`/tokens/${id}`), queryKeys.tokens, '令牌已撤销，立即失效')

export const useDeleteTokens = () =>
  useBatchMutation<number>((id) => del(`/tokens/${id}`), queryKeys.tokens, '撤销')

export const useKillJob = () =>
  useInvalidatingMutation<string, unknown>(
    (id) => post(`/jobs/${id}/kill`, {}),
    queryKeys.jobs,
    '已发送终止信号',
  )

export const useKillJobs = () =>
  useBatchMutation<string>((id) => post(`/jobs/${id}/kill`, {}), queryKeys.jobs, '终止')

/* ── 记忆 ───────────────────────────────────────────────────────── */

/** 删除同时改变列表与库统计，故失效整个 ['memories'] 前缀而不是单条列表 key */
export const useDeleteMemory = () =>
  useInvalidatingMutation<number, void>(
    (id) => del(`/memories/${id}`),
    queryKeys.memories,
    '记忆已删除',
  )

export const useDeleteMemories = () =>
  useBatchMutation<number>((id) => del(`/memories/${id}`), queryKeys.memories, '删除')

/* ── SFTP 上传 ──────────────────────────────────────────────────── */

export function useUpload(hostId: number | undefined, path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      if (hostId == null) throw new Error('请先选择主机')
      return uploadFile(hostId, path.replace(/\/$/, '') + '/', file)
    },
    onSuccess: () => {
      toast.success('上传完成')
      void qc.invalidateQueries({ queryKey: queryKeys.sftp(hostId ?? 0, path) })
    },
    onError,
  })
}

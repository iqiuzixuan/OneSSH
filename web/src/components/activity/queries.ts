import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { AuditFilter } from '@/api/queries'
import type { Audit } from '@/api/types'

export const AUDIT_PAGE = 100

/** 把筛选条件拼成查询串；多值重复参数而不是逗号拼接——主机名允许含逗号 */
export function auditParams(filter: AuditFilter, before?: number) {
  const params = new URLSearchParams({ limit: String(AUDIT_PAGE) })
  for (const tool of filter.tool ?? []) params.append('tool', tool)
  for (const token of filter.token ?? []) params.append('token', String(token))
  for (const host of filter.host ?? []) params.append('host', host)
  if (filter.ok != null) params.set('ok', String(filter.ok))
  if (filter.denied != null) params.set('denied', String(filter.denied))
  if (before) params.set('before', String(before))
  return params
}

/**
 * 分页的审计流：第一页随实时事件节流失效重拉（键以 ['audit'] 开头，LiveProvider 会命中），
 * 更早的记录按 before=最小 id 往下翻。切换筛选时旧数据留在原位渐隐，而不是塌成骨架屏。
 */
export function useAuditPages(filter: AuditFilter) {
  return useInfiniteQuery({
    queryKey: ['audit', 'pages', filter],
    queryFn: ({ pageParam }) => api<Audit[]>(`/audit?${auditParams(filter, pageParam || undefined)}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.length === AUDIT_PAGE ? last[last.length - 1].ID : undefined),
    placeholderData: keepPreviousData,
    // 新调用靠实时事件触发失效；轮询只兜底 SSE 断线的空窗
    refetchInterval: 30_000,
  })
}

/**
 * 按 id 取单条审计：先翻已加载的列表缓存，没有再用 before=id+1&limit=1 精确取一条。
 * 详情面板可以直链（?audit=ID），刷新页面或 id 不在当前页时也能打开。
 */
export function useAuditById(id: number | null) {
  const qc = useQueryClient()
  return useQuery({
    // 审计行写入后不再变化：键不以 ['audit'] 开头，免得每条实时事件都把它失效重拉
    queryKey: ['audit-row', id],
    enabled: id != null,
    staleTime: Infinity,
    initialData: () => {
      if (id == null) return undefined
      for (const [, data] of qc.getQueriesData<InfiniteData<Audit[]>>({ queryKey: ['audit', 'pages'] })) {
        const hit = data?.pages.flat().find((row) => row.ID === id)
        if (hit) return hit
      }
      return undefined
    },
    queryFn: async () => {
      const rows = await api<Audit[]>(`/audit?before=${(id ?? 0) + 1}&limit=1`)
      const hit = rows.find((row) => row.ID === id)
      if (!hit) throw new Error('这条审计记录不存在，可能已被清理')
      return hit
    },
  })
}

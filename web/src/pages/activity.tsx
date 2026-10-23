import {
  ArrowUp,
  CaretDown,
  Check,
  DownloadSimple,
  MagnifyingGlass,
  Pause,
  Play,
  Pulse,
  Ticket,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useLive } from '@/api/live'
import { useAuditTools, useHosts, useOverview, useTokens, type AuditFilter } from '@/api/queries'
import type { Audit } from '@/api/types'
import { AuditSheet } from '@/components/activity/audit-sheet'
import { useAuditById, useAuditPages } from '@/components/activity/queries'
import { ROW_HEIGHT, StreamHeader, StreamRow, StreamRows } from '@/components/activity/stream'
import { CommandRunSheet } from '@/components/command-run-detail'
import { Dot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ColumnFilter } from '@/components/ui/column-filter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Num } from '@/components/ui/number'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { parseAuditParams } from '@/lib/audit'
import { callFromAudit, callFromEvent, mergeCalls, toolTag, type CallItem } from '@/lib/calls'
import { cn } from '@/lib/cn'
import { spring, staggerItem } from '@/lib/motion'

type Result = 'all' | 'ok' | 'failed' | 'denied'
const RESULTS: Result[] = ['all', 'ok', 'failed', 'denied']
/** 类别分段的固定顺序；只展示审计里真实出现过的类别 */
const CATEGORY_ORDER = ['EXEC', 'FILE', 'GREP', 'JOB', 'MEMORY', 'STAT', 'HOST', 'OUT']
/** 滚动离开顶部多远之后，新事件改为进缓冲而不是直接插入 */
const TOP_THRESHOLD = 140

const RESULT_FILTER: Record<Result, Pick<AuditFilter, 'ok' | 'denied'>> = {
  all: {},
  ok: { ok: true },
  failed: { ok: false, denied: false },
  denied: { denied: true },
}

function useAtTop() {
  const [atTop, setAtTop] = useState(() => window.scrollY < TOP_THRESHOLD)
  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY < TOP_THRESHOLD)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return atTop
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'bad' | 'warn' }) {
  return (
    <div>
      <b
        className={cn(
          'mb-0.5 block text-[20px] leading-tight font-medium tracking-[-0.02em]',
          tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink',
        )}
      >
        <Num value={value} />
      </b>
      {label}
    </div>
  )
}

function exportRows(rows: Audit[]) {
  const body = rows.map((row) => JSON.stringify(row)).join('\n')
  const blob = new Blob([body + '\n'], { type: 'application/x-ndjson' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  const link = document.createElement('a')
  link.href = url
  link.download = `onessh-audit-${stamp}.jsonl`
  link.click()
  URL.revokeObjectURL(url)
  toast.success(`已导出 ${rows.length} 条记录`, { description: link.download })
}

export function ActivityPage() {
  const navigate = useNavigate()
  const { runId } = useParams()
  const [search, setSearch] = useSearchParams()
  const { events, status } = useLive()
  const { data: overview } = useOverview(24)
  const { data: tokens = [] } = useTokens()
  const { data: hosts = [] } = useHosts()
  const auditTools = useAuditTools()
  const atTop = useAtTop()
  const [paused, setPaused] = useState(false)

  /* ── 筛选：全部落在 URL 上，概览的「需要留意」可以直链 /activity?result=denied ── */
  const resultParam = search.get('result') as Result | null
  const result: Result = resultParam && RESULTS.includes(resultParam) ? resultParam : 'all'
  const tokenId = search.get('token') ? Number(search.get('token')) : null
  const category = search.get('cat') ?? 'all'
  const exactTools = search.getAll('tool')
  const hostFilter = search.getAll('host')
  const query = search.get('q') ?? ''
  const auditParam = search.get('audit') ? Number(search.get('audit')) : null

  const update = (mutate: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(search)
    mutate(next)
    setSearch(next, { replace: true })
  }
  const setOne = (key: string, value: string | null) =>
    update((p) => {
      if (value == null || value === '' || value === 'all') p.delete(key)
      else p.set(key, value)
    })
  const setMany = (key: string, values: string[]) =>
    update((p) => {
      p.delete(key)
      for (const value of values) p.append(key, value)
    })
  const clearFilters = () =>
    update((p) => {
      for (const key of ['result', 'token', 'cat', 'tool', 'host', 'q']) p.delete(key)
    })

  const allTools = auditTools.data ?? []
  const categories = useMemo(() => {
    const present = new Set(allTools.map(toolTag))
    return CATEGORY_ORDER.filter((c) => present.has(c))
  }, [allTools])

  // 类别是「工具名的分组」：后端按精确工具名筛，这里把类别展开成工具名单；与列头的精确工具筛选取交集
  const effectiveTools = useMemo(() => {
    let list = category === 'all' ? null : allTools.filter((tool) => toolTag(tool) === category)
    if (exactTools.length) list = (list ?? exactTools).filter((tool) => exactTools.includes(tool))
    if (list && list.length === 0) return ['\u0000none'] // 交集为空：给一个不存在的工具名，让结果诚实地为空
    return list ?? []
  }, [allTools, category, exactTools.join('\u0001')])

  const filter: AuditFilter = {
    tool: effectiveTools,
    token: tokenId != null ? [tokenId] : undefined,
    host: hostFilter,
    ...RESULT_FILTER[result],
  }
  const filterKey = JSON.stringify(filter)
  const pages = useAuditPages(filter)
  const audits = useMemo(() => pages.data?.pages.flat() ?? [], [pages.data])
  const auditById = useMemo(() => new Map(audits.map((row) => [row.ID, row])), [audits])
  const filtered = result !== 'all' || tokenId != null || category !== 'all' || exactTools.length > 0 || hostFilter.length > 0 || query !== ''

  /* ── 实时事件按同一套条件在前端过滤，再与审计页合并去重 ── */
  const needle = query.trim().toLowerCase()
  const incoming: CallItem[] = useMemo(() => {
    const toolSet = effectiveTools.length ? new Set(effectiveTools) : null
    const hostSet = hostFilter.length ? new Set(hostFilter) : null
    const live = events
      .map(callFromEvent)
      .filter((call): call is CallItem => {
        if (!call) return false
        if (tokenId != null && call.tokenId !== tokenId) return false
        if (toolSet && !toolSet.has(call.tool)) return false
        if (hostSet && !hostSet.has(call.host)) return false
        if (result !== 'all' && call.outcome !== result) return false
        return true
      })
    // exec_many 的审计没有单一主机：从参数里的 hosts 补出「web-01, web-02」，实时事件同理按审计 id 回填
    const merged = mergeCalls(live, audits.map(callFromAudit), audits.length + 200).map((call) => {
      if (call.host || call.auditId == null) return call
      const hostsParam = parseAuditParams(auditById.get(call.auditId)?.ParamsJSON ?? '')?.hosts
      return Array.isArray(hostsParam) && hostsParam.length ? { ...call, host: hostsParam.join(', ') } : call
    })
    if (!needle) return merged
    // 搜索只覆盖已加载的记录（审计接口没有全文检索）：命令、路径、参数、主机、工具名
    return merged.filter((call) => {
      const row = call.auditId != null ? auditById.get(call.auditId) : undefined
      const hay = `${call.tool} ${call.summary} ${call.host} ${call.token ?? ''} ${row?.ParamsJSON ?? ''}`
      return hay.toLowerCase().includes(needle)
    })
  }, [events, audits, auditById, filterKey, needle])

  /* ── 实时但不打扰：暂停或滚离顶部时冻结当前列表，新事件只计数，浮出胶囊 ── */
  const [frozen, setFrozen] = useState<CallItem[] | null>(null)
  const shouldFreeze = paused || !atTop
  useEffect(() => setFrozen(null), [filterKey, needle])
  useEffect(() => {
    if (!shouldFreeze) setFrozen(null)
    else if (frozen == null && !pages.isPlaceholderData) setFrozen(incoming)
  }, [shouldFreeze, frozen, incoming, pages.isPlaceholderData])

  const { visible, pending } = useMemo(() => {
    if (!frozen) return { visible: incoming, pending: 0 }
    const keys = new Set(frozen.map((item) => item.key))
    const newest = frozen[0]?.ts ?? 0
    const oldest = frozen[frozen.length - 1]?.ts ?? Infinity
    return {
      // 冻结期间翻到的更早记录照常接在底部
      visible: [...frozen, ...incoming.filter((item) => item.ts < oldest && !keys.has(item.key))],
      pending: incoming.filter((item) => item.ts >= newest && !keys.has(item.key)).length,
    }
  }, [frozen, incoming])

  const flush = () => {
    setPaused(false)
    setFrozen(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ── 详情：命令运行走 /activity/:runId，其余审计走 ?audit=ID；关闭动画期间保留上一份内容 ── */
  const lastRun = useRef<string | null>(null)
  if (runId) lastRun.current = runId
  const lastAudit = useRef<number | null>(null)
  if (auditParam != null) lastAudit.current = auditParam
  const auditDetail = useAuditById(auditParam ?? (runId ? null : lastAudit.current))
  const keepSearch = (mutate?: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(search)
    mutate?.(next)
    const qs = next.toString()
    return qs ? `?${qs}` : ''
  }
  const openCall = (call: CallItem) => {
    if (call.runIds[0]) {
      navigate(`/activity/${call.runIds[0]}${keepSearch((p) => (call.auditId != null ? p.set('audit', String(call.auditId)) : p.delete('audit')))}`)
    } else if (call.auditId != null) {
      setOne('audit', String(call.auditId))
    }
  }
  const closeDetail = () => navigate(`/activity${keepSearch((p) => p.delete('audit'))}`)

  /* ── 选项 ── */
  const summary = overview?.summary
  const tokenOptions = useMemo(() => {
    const stats = new Map(summary?.tokens.map((t) => [t.token_id, t]) ?? [])
    const list = tokens.map((t) => ({ id: t.id, name: t.name, calls: stats.get(t.id)?.calls ?? 0 }))
    // 已删除的令牌在审计里仍有记录，也要能筛
    for (const stat of summary?.tokens ?? []) {
      if (!list.some((t) => t.id === stat.token_id)) list.push({ id: stat.token_id, name: `${stat.token_name}（已删除）`, calls: stat.calls })
    }
    return list.sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))
  }, [tokens, summary])
  const hostOptions = useMemo(() => {
    const names = new Set([...hosts.map((h) => h.name), ...(summary?.hosts.map((h) => h.host) ?? [])])
    return [...names].sort().map((name) => ({ value: name, label: name }))
  }, [hosts, summary])
  const tokenLabel = tokenId == null ? '全部令牌' : (tokenOptions.find((t) => t.id === tokenId)?.name ?? `令牌 #${tokenId}`)

  const calls = summary?.calls ?? 0
  const denied = summary?.denied ?? 0
  const failed = summary?.failed ?? 0
  const loading = pages.isLoading
  const showEmpty = !loading && !pages.isError && visible.length === 0

  return (
    <PageTransition>
      <PageHeader
        title="活动"
        description="每一次 MCP 调用都在这里留痕，包括被网关拒绝的。命令类调用可以展开，看真实的退出码与输出。"
        actions={
          <>
            <span className="inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] text-ink-2">
              {paused ? (
                <>
                  <Dot idle />
                  已暂停
                </>
              ) : status === 'open' ? (
                <>
                  <Dot tone="ok" live />
                  实时
                </>
              ) : (
                <>
                  <Dot tone="warn" />
                  重连中
                </>
              )}
            </span>
            <Button onClick={() => (paused ? flush() : setPaused(true))}>
              {paused ? <Play /> : <Pause />}
              {paused ? '继续' : '暂停'}
            </Button>
            <Button
              disabled={audits.length === 0}
              onClick={() => exportRows(needle ? audits.filter((row) => visible.some((call) => call.auditId === row.ID)) : audits)}
            >
              <DownloadSimple />
              导出
            </Button>
          </>
        }
      />

      <motion.div variants={staggerItem} className="mx-0.5 -mt-1.5 mb-[18px] flex flex-wrap gap-x-7 gap-y-3 text-[12.5px] text-ink-3">
        <Stat value={calls} label="近 24 小时调用" />
        <Stat value={denied} label="被网关拒绝" tone={denied > 0 ? 'bad' : undefined} />
        <Stat value={failed} label="执行失败" tone={failed > 0 ? 'warn' : undefined} />
        <Stat value={summary?.commands.total ?? 0} label="命令执行" />
        <Stat value={summary?.tokens.length ?? 0} label="活跃令牌" />
      </motion.div>

      <motion.div variants={staggerItem} className="mb-3 flex flex-wrap items-center gap-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className={cn(tokenId != null && 'shadow-[0_0_0_1px_var(--ink-3)]')}>
              <Ticket />
              <span className="max-w-[140px] truncate">{tokenLabel}</span>
              <CaretDown size={12} className="text-ink-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[360px] overflow-y-auto">
            <DropdownMenuItem onSelect={() => setOne('token', null)} hint={calls}>
              <Ticket />
              全部令牌
              {tokenId == null && <Check size={13} className="ml-1 text-ink" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {tokenOptions.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => setOne('token', String(t.id))} hint={t.calls}>
                <span className="truncate">{t.name}</span>
                {tokenId === t.id && <Check size={13} className="text-ink" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {categories.length > 0 && (
          <Segmented
            value={categories.includes(category) ? category : 'all'}
            onChange={(value) => setOne('cat', value)}
            aria-label="按工具类别筛选"
            options={[
              { value: 'all', label: '全部' },
              ...categories.map((c) => ({ value: c, label: <span className="font-mono text-[11.5px]">{c}</span> })),
            ]}
          />
        )}

        <Segmented
          value={result}
          onChange={(value) => setOne('result', value)}
          aria-label="按结果筛选（计数为近 24 小时）"
          options={[
            { value: 'all', label: '全部结果' },
            { value: 'ok', label: '成功', count: Math.max(0, calls - denied - failed) },
            { value: 'failed', label: '失败', count: failed },
            { value: 'denied', label: '拒绝', count: denied },
          ]}
        />

        <Input
          wrapperClassName="ml-auto w-full sm:w-60"
          value={query}
          onChange={(event) => setOne('q', event.target.value)}
          placeholder="搜索命令、路径或参数…"
          aria-label="搜索命令、路径或参数"
          spellCheck={false}
          prefix={<MagnifyingGlass />}
          suffix={
            query ? (
              <button type="button" aria-label="清空搜索" onClick={() => setOne('q', null)} className="text-ink-3 hover:text-ink">
                <X size={13} />
              </button>
            ) : undefined
          }
        />
      </motion.div>

      <motion.div variants={staggerItem}>
        <Card className="relative px-1.5 pb-1.5">
          {/* 「N 条新事件」胶囊：吸顶浮在列表上方，点击回顶并合入 */}
          <div className="pointer-events-none sticky top-3.5 z-10 -mb-8 flex h-8 justify-center">
            <AnimatePresence>
              {pending > 0 && (
                <motion.button
                  type="button"
                  onClick={flush}
                  className="pointer-events-auto flex h-8 items-center gap-1.5 rounded-full bg-primary pr-3.5 pl-3 text-[12.5px] font-medium text-primary-fg shadow-[0_8px_24px_-6px_rgb(0_0_0/.35)]"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: spring.soft }}
                  exit={{ opacity: 0, y: -8, scale: 0.96, transition: spring.exit }}
                >
                  <ArrowUp size={13} weight="bold" />
                  {paused ? '已暂停 · ' : ''}
                  <Num value={pending} /> 条新事件
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <StreamHeader
            categoryFilter={
              <ColumnFilter
                multi
                optionBadge
                aria-label="按精确工具名筛选"
                value={exactTools}
                onChange={(values) => setMany('tool', values)}
                options={allTools.map((tool) => ({ value: tool, label: tool }))}
              />
            }
            hostFilter={
              <ColumnFilter
                multi
                aria-label="按主机筛选"
                value={hostFilter}
                onChange={(values) => setMany('host', values)}
                options={hostOptions}
              />
            }
          />

          {loading ? (
            <div className="flex flex-col">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-3" style={{ height: ROW_HEIGHT }}>
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="size-2 rounded-full" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-3 flex-1" style={{ maxWidth: `${40 + ((i * 17) % 45)}%` }} />
                </div>
              ))}
            </div>
          ) : pages.isError ? (
            <EmptyState
              icon={<WarningCircle />}
              title="审计记录加载失败"
              description={(pages.error as Error).message}
              action={<Button onClick={() => void pages.refetch()}>重试</Button>}
            />
          ) : showEmpty ? (
            filtered ? (
              <EmptyState
                icon={<Pulse />}
                title="这个筛选下没有记录"
                description={needle ? '已加载的记录里没有匹配的命令或参数；更早的记录可以继续往下加载后再搜。' : '新调用到达时会自动出现在这里。'}
                action={<Button onClick={clearFilters}>清除筛选</Button>}
              />
            ) : (
              <EmptyState
                icon={<Pulse />}
                title="还没有调用"
                description="Agent 通过 MCP 网关调用工具后，每一次调用都会实时出现在这里，包括被拒绝的。"
              />
            )
          ) : (
            <div className={cn('transition-opacity duration-150', pages.isPlaceholderData && 'opacity-60')}>
              {/* 换筛选时整列重建：不让上百行一起做进出场 */}
              <StreamRows
                key={filterKey + needle}
                items={visible}
                render={(call) => (
                  <StreamRow
                    call={call}
                    onOpen={call.runIds.length > 0 || call.auditId != null ? () => openCall(call) : undefined}
                  />
                )}
              />
            </div>
          )}

          {!loading && !pages.isError && visible.length > 0 && (
            <div className="flex items-center justify-center gap-3 px-3 pt-2.5 pb-1.5 text-[12px] text-ink-3">
              {pages.hasNextPage ? (
                <Button size="sm" variant="ghost" loading={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
                  加载更早的记录
                </Button>
              ) : (
                <span>已经到底了 · 共 {audits.length} 条</span>
              )}
            </div>
          )}
        </Card>
      </motion.div>

      <CommandRunSheet
        open={!!runId}
        runId={runId ?? lastRun.current}
        audit={auditDetail.data}
        onClose={closeDetail}
        onSwitchRun={(id) => navigate(`/activity/${id}${keepSearch()}`)}
      />
      <AuditSheet
        open={!runId && auditParam != null}
        audit={auditDetail.data}
        loading={auditDetail.isLoading}
        error={auditDetail.error as Error | null}
        onClose={() => setOne('audit', null)}
      />
    </PageTransition>
  )
}

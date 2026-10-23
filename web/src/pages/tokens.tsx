import { MagnifyingGlass, PencilSimple, Plus, Prohibit, Ticket, WarningCircle } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useLive } from '@/api/live'
import { useDeleteToken, useDeleteTokens, useHosts, useOverview, useTokens, useToolGroups } from '@/api/queries'
import type { Host, Token, ToolCallEventData, ToolGroup } from '@/api/types'
import { CapabilityFingerprint, groupLabel } from '@/components/tokens/scope'
import { TokenEditDialog } from '@/components/tokens/token-edit-dialog'
import { TokenWizard } from '@/components/tokens/token-wizard'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Initials } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, SectionHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Num } from '@/components/ui/number'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { SelectionBar } from '@/components/ui/selection-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { formatAgo } from '@/lib/format'
import { staggerItem } from '@/lib/motion'

/** 每 10 秒推进一次的「现在」，相对时间据此刷新 */
function useNow(interval = 10_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(timer)
  }, [interval])
  return now
}

/** 未来时间：3 天后 / 5 小时后 / 12 分钟后 */
function formatIn(ms: number, now: number) {
  const d = ms - now
  if (d <= 0) return null
  if (d < 3_600_000) return `${Math.max(1, Math.round(d / 60_000))} 分钟后`
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)} 小时后`
  return `${Math.round(d / 86_400_000)} 天后`
}

/** 行网格：选择 · 身份 · 主机范围 · 能力 · 24h 调用 · 最近使用 · 动作；窄屏逐列收起 */
const ROW_GRID =
  'grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-4 ' +
  'md:grid-cols-[16px_minmax(190px,1.25fr)_minmax(150px,1fr)_160px_auto] ' +
  'xl:grid-cols-[16px_minmax(200px,1.25fr)_minmax(170px,1fr)_160px_104px_96px_auto]'

function ColLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[11px] text-ink-3">{children}</div>
}

function HostScope({ token, hostsById }: { token: Token; hostsById: Map<number, Host> }) {
  if (token.all_hosts) {
    return <span className="inline-flex h-[22px] items-center rounded-full bg-well px-2 text-[11.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--edge)]">全部主机</span>
  }
  const names = (token.host_ids ?? []).map((id) => hostsById.get(id)?.name ?? `#${id}`)
  if (names.length === 0) return <span className="text-[12px] text-ink-3">{token.manage_hosts ? '仅管理，无执行主机' : '无授权主机'}</span>
  const rest = names.slice(2)
  return (
    <span className="flex flex-wrap items-center gap-1">
      {names.slice(0, 2).map((name) => (
        <span key={name} className="inline-flex h-[22px] items-center rounded-full bg-well px-2 font-mono text-[11px] text-ink-2 shadow-[inset_0_0_0_1px_var(--edge)]">
          {name}
        </span>
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.join('、')}>
          <span className="inline-flex h-[22px] items-center rounded-full bg-well px-2 text-[11.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--edge)]">+{rest.length}</span>
        </Tooltip>
      )}
    </span>
  )
}

function TokenRow({
  token,
  hostsById,
  groups,
  calls,
  lastUsed,
  now,
  fresh,
  selected,
  selecting,
  onToggle,
  onEdit,
  onRevoke,
}: {
  token: Token
  hostsById: Map<number, Host>
  groups: ToolGroup[]
  calls: number
  lastUsed?: number
  now: number
  fresh: boolean
  selected: boolean
  selecting: boolean
  onToggle: () => void
  onEdit: () => void
  onRevoke: () => void
}) {
  const oauth = token.source === 'oauth'
  const disabled = (token.disabled_tools ?? []).map(groupLabel)
  const expiresIn = token.expires_at ? formatIn(token.expires_at, now) : null
  const meta = oauth
    ? ['OAuth', token.client_id ? token.client_id.slice(0, 8) : null, `${formatAgo(token.created_at * 1000, now)}授权`]
    : ['手工令牌', `${formatAgo(token.created_at * 1000, now)}签发`]

  return (
    <motion.div
      layout="position"
      initial={false}
      exit={{ opacity: 0, x: 12, height: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] } }}
      className={cn(
        'group/trow relative overflow-hidden rounded-well px-3 py-3 transition-colors duration-150',
        '[&+&]:shadow-[0_-1px_0_var(--line)] hover:bg-hover hover:shadow-none [&:hover+&]:shadow-none',
        selected && 'bg-well-2 hover:bg-well-2',
        ROW_GRID,
      )}
    >
      {fresh && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-well-2"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, delay: 0.9, ease: 'easeOut' }}
        />
      )}
      <span
        className={cn(
          'relative transition-opacity duration-150',
          selected || selecting ? 'opacity-100' : 'opacity-0 group-hover/trow:opacity-100 focus-within:opacity-100',
        )}
      >
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`选择令牌 ${token.name}`} />
      </span>

      <div className="relative flex min-w-0 items-center gap-3">
        <Initials name={token.name} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{token.name}</div>
          <div className="mt-px truncate text-[11.5px] whitespace-nowrap text-ink-3">
            {meta.filter(Boolean).join(' · ')}
            {oauth && token.expires_at && (
              <span className={cn(!expiresIn && 'text-bad')}> · {expiresIn ? `${expiresIn}过期` : '已过期'}</span>
            )}
          </div>
        </div>
      </div>

      <div className="relative hidden min-w-0 md:block">
        <ColLabel>主机范围</ColLabel>
        <HostScope token={token} hostsById={hostsById} />
      </div>

      <div className="relative hidden min-w-0 md:block">
        <ColLabel>能力</ColLabel>
        <CapabilityFingerprint token={token} groups={groups} />
        <div className="mt-[5px] truncate text-[11.5px] text-ink-3">
          {token.manage_hosts ? (
            <span className="text-warn">可管理主机</span>
          ) : disabled.length ? (
            `禁用 ${disabled.join('、')}`
          ) : (
            '全部工具'
          )}
        </div>
      </div>

      <div className="relative hidden xl:block">
        <ColLabel>24 小时调用</ColLabel>
        <div className="text-[15px] font-medium tracking-[-0.01em]">
          <Num value={calls} />
        </div>
      </div>

      <div className="relative hidden xl:block">
        <ColLabel>最近使用</ColLabel>
        <div className="text-[12px] whitespace-nowrap text-ink-2">{lastUsed ? formatAgo(lastUsed, now) : '从未使用'}</div>
      </div>

      <div className="relative flex justify-end gap-0.5 opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover/trow:opacity-100 md:focus-within:opacity-100">
        <Tooltip content="编辑范围">
          <Button variant="ghost" size="icon-sm" aria-label={`编辑令牌 ${token.name}`} onClick={onEdit}>
            <PencilSimple />
          </Button>
        </Tooltip>
        <Tooltip content="撤销令牌">
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:bg-bad-soft hover:text-bad"
            aria-label={`撤销令牌 ${token.name}`}
            onClick={onRevoke}
          >
            <Prohibit />
          </Button>
        </Tooltip>
      </div>
    </motion.div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-1.5">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-8 rounded-[9px]" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-3.5 w-32 md:block" />
          <Skeleton className="hidden h-3.5 w-28 md:block" />
        </div>
      ))}
    </div>
  )
}

export function TokensPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const now = useNow()
  const tokens = useTokens()
  const { data: hosts = [] } = useHosts()
  const { data: groups = [] } = useToolGroups()
  const { data: overview } = useOverview(24)
  const { events } = useLive()
  const deleteToken = useDeleteToken()
  const deleteTokens = useDeleteTokens()

  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Token | null>(null)
  const [revoking, setRevoking] = useState<Token | null>(null)
  const [batchRevoking, setBatchRevoking] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [freshId, setFreshId] = useState<number | null>(null)

  const wizardOpen = pathname === '/tokens/new'

  // 旧深链 /tokens?new=1（书签、外部文档）统一改道到向导路由
  useEffect(() => {
    if (searchParams.get('new') === '1') navigate('/tokens/new', { replace: true })
  }, [searchParams, navigate])

  const all = tokens.data ?? []
  const hostsById = useMemo(() => new Map(hosts.map((h) => [h.id, h])), [hosts])
  const callsById = useMemo(() => new Map(overview?.summary.tokens.map((t) => [t.token_id, t.calls]) ?? []), [overview])

  // 最近使用：库里的 last_used_at 只在令牌被校验时写入，实时事件来得更快，两者取新
  const liveLastUsed = useMemo(() => {
    const map = new Map<number, number>()
    for (const event of events) {
      if (event.type !== 'tool_call') continue
      const id = (event.data as ToolCallEventData | null)?.token_id
      if (id != null && (map.get(id) ?? 0) < event.ts) map.set(id, event.ts)
    }
    return map
  }, [events])

  // 令牌量小且一次拉全量，按名称的检索在前端本地做
  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => (q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all), [all, q])
  const oauthTokens = filtered.filter((t) => t.source === 'oauth')
  const manualTokens = filtered.filter((t) => t.source !== 'oauth')

  // 被搜索移出视野的令牌不该继续留在选中态里，批量撤销只作用于看得见的行
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const visible = new Set(filtered.map((t) => t.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [filtered])

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onCreated = useCallback((token: Token) => setFreshId(token.id), [])
  const totalCalls = overview?.summary.tokens.reduce((sum, t) => sum + t.calls, 0) ?? 0

  const renderList = (list: Token[], kind: 'oauth' | 'manual') => {
    if (tokens.isLoading) return <ListSkeleton />
    if (list.length === 0) {
      return q ? (
        <EmptyState
          className="pt-9 pb-10"
          icon={<MagnifyingGlass />}
          title={`没有匹配「${query.trim()}」的${kind === 'oauth' ? ' OAuth 客户端' : '手工令牌'}`}
          action={<Button onClick={() => setQuery('')}>清除搜索</Button>}
        />
      ) : (
        <EmptyState
          className="pt-9 pb-10"
          icon={<Ticket />}
          title={kind === 'oauth' ? '还没有 OAuth 客户端' : '还没有手工令牌'}
          description={
            kind === 'oauth'
              ? '让支持 MCP OAuth 的客户端直接连接 /mcp，在授权页勾选主机与工具即可，不需要手工签发。'
              : '为 CI、脚本或不支持 OAuth 的 Agent 签发一枚范围最小的令牌。'
          }
          action={
            kind === 'manual' ? (
              <Button variant="primary" onClick={() => navigate('/tokens/new')}>
                <Plus />
                签发令牌
              </Button>
            ) : undefined
          }
        />
      )
    }
    return (
      <div className="p-1.5">
        <AnimatePresence initial={false}>
          {list.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              hostsById={hostsById}
              groups={groups}
              calls={callsById.get(token.id) ?? 0}
              lastUsed={Math.max(token.last_used_at ?? 0, liveLastUsed.get(token.id) ?? 0) || undefined}
              now={now}
              fresh={token.id === freshId}
              selected={selected.has(token.id)}
              selecting={selected.size > 0}
              onToggle={() => toggle(token.id)}
              onEdit={() => setEditing(token)}
              onRevoke={() => setRevoking(token)}
            />
          ))}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <PageTransition>
      <PageHeader
        eyebrow={tokens.data ? `${all.length} 枚令牌 · 24 小时 ${totalCalls.toLocaleString('zh-CN')} 次调用` : undefined}
        title="令牌"
        description="令牌决定 Agent 能碰哪些主机、能用哪些工具。撤销即刻生效，不必登录任何一台机器去轮换 authorized_keys。"
        actions={
          <>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索令牌名称"
              aria-label="搜索令牌名称"
              spellCheck={false}
              prefix={<MagnifyingGlass />}
              wrapperClassName="w-52"
            />
            <Button variant="primary" onClick={() => navigate('/tokens/new')}>
              <Plus />
              签发令牌
            </Button>
          </>
        }
      />

      {tokens.isError ? (
        <motion.div variants={staggerItem}>
          <Card>
            <EmptyState
              icon={<WarningCircle className="text-bad" />}
              title="令牌列表加载失败"
              description={(tokens.error as Error).message}
              action={<Button onClick={() => void tokens.refetch()}>重试</Button>}
            />
          </Card>
        </motion.div>
      ) : (
        <>
          <motion.div variants={staggerItem}>
            <SectionHeader
              className="mt-0"
              title="OAuth 客户端"
              actions={<span className="text-[12px] text-ink-3">支持 MCP OAuth 的 Agent 在授权页自助接入</span>}
            />
            <Card>{renderList(oauthTokens, 'oauth')}</Card>
          </motion.div>
          <motion.div variants={staggerItem}>
            <SectionHeader
              title="手工令牌"
              actions={
                groups.length > 0 && (
                  <span className="hidden items-center gap-2 text-[12px] text-ink-3 md:inline-flex">
                    能力格依次为 {groups.map((g) => groupLabel(g.name)).join(' · ')} · <span className="text-warn">管理</span>
                    <span className="inline-flex gap-[3px]" aria-hidden>
                      <i className="size-3 rounded-[3.5px] bg-ink-2" />
                      <i className="size-3 rounded-[3.5px] shadow-[inset_0_0_0_1.25px_var(--ink-4)]" />
                    </span>
                    可用 / 禁用
                  </span>
                )
              }
            />
            <Card>{renderList(manualTokens, 'manual')}</Card>
          </motion.div>
        </>
      )}

      <TokenWizard
        open={wizardOpen}
        onClose={() => navigate('/tokens')}
        hosts={hosts}
        groups={groups}
        tokens={all}
        onCreated={onCreated}
      />

      <TokenEditDialog token={editing} onClose={() => setEditing(null)} hosts={hosts} groups={groups} tokens={all} />

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button size="sm" onClick={() => setBatchRevoking(true)}>
          <Prohibit />
          撤销
        </Button>
      </SelectionBar>

      <ConfirmDialog
        open={revoking != null}
        onOpenChange={(open) => !open && setRevoking(null)}
        danger
        icon={<Prohibit weight="bold" />}
        title={revoking ? `撤销「${revoking.name}」？` : '撤销令牌？'}
        description={
          <>
            使用这枚令牌的 Agent 会在下一次调用时收到 <code className="font-mono text-[12px]">401</code>。
            {revoking?.source === 'oauth' ? '该客户端需要重新走一遍 OAuth 授权。' : '令牌明文无法恢复，只能重新签发。'}
            审计记录里的历史调用会保留令牌名称与 ID。
          </>
        }
        confirmText="撤销令牌"
        onConfirm={async () => {
          if (!revoking) return
          await deleteToken.mutateAsync(revoking.id)
          // 撤销成功才摘掉选中项：失败时保留，批量条上还能看到它并重试
          setSelected((prev) => {
            if (!prev.has(revoking.id)) return prev
            const next = new Set(prev)
            next.delete(revoking.id)
            return next
          })
        }}
      />

      <ConfirmDialog
        open={batchRevoking}
        onOpenChange={setBatchRevoking}
        danger
        icon={<Prohibit weight="bold" />}
        title={`撤销 ${selected.size} 枚令牌？`}
        description="使用这些令牌的 Agent 会在下一次调用时收到 401；手工令牌只能重新签发，OAuth 客户端需要重新授权。"
        confirmText="全部撤销"
        onConfirm={async () => {
          // 失败的留在选中态，方便对照着重试
          const { failedIds } = await deleteTokens.mutateAsync([...selected])
          setSelected(new Set(failedIds))
        }}
      />
    </PageTransition>
  )
}


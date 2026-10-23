import {
  CaretRight,
  Copy,
  DotsThree,
  FingerprintSimple,
  FolderOpen,
  Funnel,
  HardDrives,
  Key,
  LockKey,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  PlugsConnected,
  Terminal,
  Trash,
} from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { queryKeys, useDeleteHost, useDeleteHosts, useHosts, useKeys, useResetFingerprint } from '@/api/queries'
import type { Host, Metric } from '@/api/types'
import { HostConnection } from '@/components/host-connection'
import { HostFormDialog } from '@/components/hosts/host-form-dialog'
import { healthLine, HostSheet } from '@/components/hosts/host-sheet'
import {
  latestOf,
  STATE_TONE,
  stateOf,
  useHostMetrics,
  useHostTest,
  useToggleMonitor,
} from '@/components/hosts/host-utils'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Chip, Dot, Tag } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ColumnFilter } from '@/components/ui/column-filter'
import { DataTable, type Column } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Kbd } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Segmented } from '@/components/ui/segmented'
import { SelectionBar } from '@/components/ui/selection-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { memPct, type HostState } from '@/lib/calls'
import { cn } from '@/lib/cn'
import { staggerItem } from '@/lib/motion'

type StatusFilter = 'all' | 'online' | 'offline' | 'idle'
type ConfirmState = { kind: 'reset' | 'delete'; host: Host } | { kind: 'batch-delete' } | null

const matchStatus = (state: HostState, filter: StatusFilter) =>
  filter === 'all' ||
  (filter === 'online' && state === 'online') ||
  (filter === 'offline' && state === 'offline') ||
  (filter === 'idle' && (state === 'unknown' || state === 'sampling'))

/** 迷你条：44px 轨道 + 等宽百分比；超过 85% 转琥珀——这是列表里唯一会因数值变色的地方 */
function Meter({ value }: { value: number }) {
  const hot = value > 85
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1 w-11 overflow-hidden rounded-full bg-well-2" aria-hidden>
        <span
          className={cn('block h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)]', hot ? 'bg-warn' : 'bg-ink-2')}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </span>
      <span className={cn('min-w-9 font-mono text-[12px] tabular-nums', hot ? 'text-warn' : 'text-ink-2')}>{Math.round(value)}%</span>
    </span>
  )
}

/** 没有指标时说清原因，而不是一排破折号 */
function MetricCell({ host, state, value }: { host: Host; state: HostState; value: number | null | undefined }) {
  if (value != null) return <Meter value={value} />
  if (state === 'offline') return <span className="text-[12px] text-ink-3">无法连接</span>
  if (!host.monitor_enabled) return <span className="text-[12px] text-ink-3">未监控</span>
  return <span className="text-[12px] text-ink-3">—</span>
}

function RouteCell({ host, byId }: { host: Host; byId: Map<number, Host> }) {
  const jump = host.jump_host_id ? byId.get(host.jump_host_id) : undefined
  if (!jump) return <span className="text-[12.5px] text-ink-3">直连</span>
  return (
    <Tooltip content={`经跳板 ${jump.name} 转发`}>
      <span className="inline-flex items-center gap-1 font-mono text-[11.5px] text-ink-2">
        <span className="rounded-[5px] bg-well-2 px-1.5 py-0.5">{jump.name}</span>
        <CaretRight size={11} className="text-ink-3" />
      </span>
    </Tooltip>
  )
}

function TagsCell({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-ink-3">—</span>
  const shown = tags.slice(0, 3)
  return (
    <span className="flex items-center gap-1" title={tags.join('、')}>
      {shown.map((tag) => (
        <Tag key={tag}>{tag}</Tag>
      ))}
      {tags.length > shown.length && <Tag>+{tags.length - shown.length}</Tag>}
    </span>
  )
}

export function HostsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id: routeId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const hosts = useHosts()
  const keys = useKeys()
  const list = useMemo(() => hosts.data ?? [], [hosts.data])
  const byId = useMemo(() => new Map(list.map((host) => [host.id, host])), [list])
  const metrics = useHostMetrics(list)
  const toggleMonitor = useToggleMonitor(list)
  const { test, testAll, testing } = useHostTest()
  const deleteHost = useDeleteHost()
  const deleteHosts = useDeleteHosts()
  const resetFingerprint = useResetFingerprint()

  const [status, setStatus] = useState<StatusFilter>('all')
  const [tags, setTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [filterAuth, setFilterAuth] = useState<'password' | 'key' | null>(null)
  const [filterMonitor, setFilterMonitor] = useState<'on' | 'off' | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Host>()
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [resetName, setResetName] = useState('')
  const [testingAll, setTestingAll] = useState(false)
  const search = useRef<HTMLInputElement>(null)

  const stateById = useMemo(() => new Map(list.map((host) => [host.id, stateOf(host, metrics.get(host.id))])), [list, metrics])
  const allTags = useMemo(() => [...new Set(list.flatMap((host) => host.tags))].sort(), [list])
  const counts = useMemo(() => {
    const c = { all: list.length, online: 0, offline: 0, idle: 0 }
    for (const host of list) {
      const state = stateById.get(host.id)!
      if (state === 'online') c.online++
      else if (state === 'offline') c.offline++
      else c.idle++
    }
    return c
  }, [list, stateById])

  // 列表一次拉全量且无服务端分页，筛选全部在前端本地做，改动即生效、不发请求
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return list.filter((host) => {
      if (!matchStatus(stateById.get(host.id)!, status)) return false
      // 标签取「任一交集即命中」：多选是扩面而不是收窄
      if (tags.length && !host.tags.some((tag) => tags.includes(tag))) return false
      if (filterAuth && host.auth_type !== filterAuth) return false
      if (filterMonitor && host.monitor_enabled !== (filterMonitor === 'on')) return false
      if (q && ![host.name, host.addr, host.username, ...host.tags].some((text) => text.toLowerCase().includes(q))) return false
      return true
    })
  }, [list, stateById, status, tags, filterAuth, filterMonitor, query])

  const narrowedToNothing = list.length > 0 && filtered.length === 0
  const clearFilters = () => {
    setStatus('all')
    setTags([])
    setQuery('')
    setFilterAuth(null)
    setFilterMonitor(null)
  }

  // 筛选把主机移出视野后，它就不该继续留在选中态：批量删除只作用于看得见的选择
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const visible = new Set(filtered.map((host) => host.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [filtered])

  // ⌘K「添加主机」与概览空态通过 ?new=1 深链进来：消费一次参数后立刻清掉，刷新不会重复弹窗
  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    setEditing(undefined)
    setFormOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  // 「/」聚焦搜索：输入框、弹层里不抢键
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable], [role="dialog"]')) return
      event.preventDefault()
      search.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const detail = routeId ? byId.get(Number(routeId)) : undefined
  // 直链到一台不存在（或刚被删）的主机：列表加载完、且没有正在进行的重拉时仍找不到，才退回列表
  useEffect(() => {
    if (routeId && hosts.isSuccess && !hosts.isFetching && !byId.has(Number(routeId))) navigate('/hosts', { replace: true })
  }, [routeId, hosts.isSuccess, hosts.isFetching, byId, navigate])

  // 删除成功后立刻从列表缓存摘掉，不等重拉回来——行不会在确认之后还停留一会儿
  const dropFromCache = (ids: number[]) =>
    queryClient.setQueryData<Host[]>(queryKeys.hosts, (prev) => prev?.filter((host) => !ids.includes(host.id)))

  const openCreate = () => {
    setEditing(undefined)
    setFormOpen(true)
  }
  const openEdit = (host: Host) => {
    setEditing(host)
    setFormOpen(true)
  }
  const askReset = (host: Host) => {
    setResetName('')
    setConfirm({ kind: 'reset', host })
  }
  const copyAddress = async (host: Host) => {
    try {
      await navigator.clipboard.writeText(`ssh -p ${host.port} ${host.username}@${host.addr}`)
      toast.success('连接命令已复制')
    } catch {
      toast.error('复制失败，请手动选择文本')
    }
  }

  const runTestAll = async () => {
    setTestingAll(true)
    try {
      await testAll(filtered.length ? filtered : list)
    } finally {
      setTestingAll(false)
    }
  }

  const hostMenu = (host: Host) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${host.name} 的更多操作`}
          className="text-ink-3"
          onClick={(event) => event.stopPropagation()}
        >
          <DotsThree weight="bold" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => void test(host)}>
          <PlugsConnected />
          测试连接
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`/terminal?host=${encodeURIComponent(host.name)}`)}>
          <Terminal />
          打开终端
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`/files?host=${host.id}`)}>
          <FolderOpen />
          浏览文件
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyAddress(host)} hint={host.addr}>
          <Copy />
          复制连接命令
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openEdit(host)}>
          <PencilSimple />
          编辑
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger disabled={!host.hostkey_fp} onSelect={() => askReset(host)}>
          <FingerprintSimple />
          重置指纹
        </DropdownMenuItem>
        <DropdownMenuItem danger onSelect={() => setConfirm({ kind: 'delete', host })}>
          <Trash />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const latest = (host: Host): Metric | undefined => latestOf(metrics.get(host.id))
  const keyName = (id?: number) => keys.data?.find((key) => key.id === id)?.name

  const columns: Column<Host>[] = [
    {
      key: 'name',
      title: '主机',
      className: 'min-w-[200px]',
      render: (host) => {
        const state = stateById.get(host.id)!
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <Dot tone={STATE_TONE[state]} idle={state === 'unknown' || state === 'sampling'} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{host.name}</div>
              <div className={cn('truncate text-[11.5px]', state === 'offline' ? 'text-bad' : 'text-ink-3')}>
                {healthLine(host, state)}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      key: 'addr',
      title: '地址',
      className: 'w-[200px] max-w-[200px]',
      render: (host) => <HostConnection host={host} />,
    },
    {
      key: 'route',
      title: '路由',
      className: 'w-[120px]',
      render: (host) => <RouteCell host={host} byId={byId} />,
    },
    {
      key: 'auth',
      title: (
        <span className="inline-flex items-center gap-1.5">
          认证
          <ColumnFilter
            aria-label="按认证方式筛选"
            value={filterAuth}
            onChange={setFilterAuth}
            options={[
              { value: 'password', label: '密码' },
              { value: 'key', label: 'SSH 密钥' },
            ]}
            allLabel="全部认证方式"
          />
        </span>
      ),
      className: 'w-[132px] max-w-[132px]',
      render: (host) => (
        <span className="inline-flex max-w-full items-center gap-1.5 text-[12.5px] text-ink-2">
          {host.auth_type === 'key' ? <Key size={14} className="shrink-0" /> : <LockKey size={14} className="shrink-0" />}
          <span className={cn('truncate', host.auth_type === 'key' && 'font-mono text-[12px]')}>
            {host.auth_type === 'key' ? (keyName(host.key_id) ?? '密钥') : '密码'}
          </span>
        </span>
      ),
    },
    {
      key: 'tags',
      title: '标签',
      className: 'hidden w-[150px] min-[1400px]:table-cell',
      render: (host) => <TagsCell tags={host.tags} />,
    },
    {
      key: 'cpu',
      title: 'CPU',
      className: 'w-[104px]',
      render: (host) => <MetricCell host={host} state={stateById.get(host.id)!} value={latest(host)?.cpu_pct} />,
    },
    {
      key: 'mem',
      title: '内存',
      className: 'hidden w-[104px] min-[1400px]:table-cell',
      render: (host) => <MetricCell host={host} state={stateById.get(host.id)!} value={memPct(latest(host))} />,
    },
    {
      key: 'monitor',
      title: (
        <span className="inline-flex items-center gap-1.5">
          监控
          <ColumnFilter
            aria-label="按监控状态筛选"
            value={filterMonitor}
            onChange={setFilterMonitor}
            options={[
              { value: 'on', label: '已开启' },
              { value: 'off', label: '已关闭' },
            ]}
            allLabel="全部"
          />
        </span>
      ),
      className: 'w-[84px]',
      render: (host) => (
        <span onClick={(event) => event.stopPropagation()} className="inline-flex">
          <Tooltip content={host.monitor_enabled ? '资源监控已开启' : '资源监控已关闭'}>
            <span className="inline-flex">
              <Switch
                checked={host.monitor_enabled}
                aria-label={`${host.name} 资源监控`}
                onCheckedChange={(enabled) => toggleMonitor.mutate({ host, enabled })}
              />
            </span>
          </Tooltip>
        </span>
      ),
    },
    {
      key: 'actions',
      title: <span className="sr-only">操作</span>,
      className: 'w-[44px] text-right',
      render: hostMenu,
    },
  ]

  const emptyState = (
    <EmptyState
      icon={<HardDrives />}
      title="还没有主机"
      description="添加第一台主机后，Agent 就能经网关执行命令、读写文件、跑后台任务；凭据不会离开网关。"
      action={
        <Button variant="primary" onClick={openCreate}>
          <Plus />
          添加主机
        </Button>
      }
    />
  )
  const noMatchState = (
    <EmptyState
      icon={<Funnel />}
      title="没有匹配的主机"
      description="换个关键词，或清除状态、标签与列头筛选。"
      action={
        <Button size="sm" onClick={clearFilters}>
          清除筛选
        </Button>
      }
    />
  )

  return (
    <PageTransition>
      <PageHeader
        title="主机"
        description="OneSSH 代 Agent 持有这些主机的凭据。私钥与密码经 AES-256-GCM 加密存放，只在建立连接的那一刻解密。"
        actions={
          <>
            <Button loading={testingAll} disabled={list.length === 0} onClick={() => void runTestAll()}>
              {!testingAll && <PlugsConnected />}
              {testingAll ? '测试中' : filtered.length && filtered.length < list.length ? `测试 ${filtered.length} 台` : '全部测试'}
            </Button>
            <Button variant="primary" onClick={openCreate}>
              <Plus />
              添加主机
            </Button>
          </>
        }
      />

      <motion.div variants={staggerItem} className="mb-3 flex flex-wrap items-center gap-2.5">
        <Segmented
          value={status}
          onChange={setStatus}
          aria-label="按连接状态筛选"
          options={[
            { value: 'all', label: '全部', count: counts.all },
            { value: 'online', label: '在线', count: counts.online },
            { value: 'offline', label: '离线', count: counts.offline },
            ...(counts.idle ? [{ value: 'idle' as const, label: '未连接', count: counts.idle }] : []),
          ]}
        />
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="按标签筛选">
            {allTags.map((tag) => (
              <Chip
                key={tag}
                mono
                active={tags.includes(tag)}
                onClick={() => setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))}
              >
                {tag}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <Input
          ref={search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索名称、地址、标签"
          aria-label="搜索名称、地址、标签"
          spellCheck={false}
          prefix={<MagnifyingGlass />}
          suffix={query ? undefined : <Kbd>/</Kbd>}
          wrapperClassName="w-full sm:w-[248px]"
          onKeyDown={(event) => event.key === 'Escape' && (setQuery(''), event.currentTarget.blur())}
        />
      </motion.div>

      <motion.div variants={staggerItem}>
        <Card className="hidden p-1.5 md:block">
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(host) => host.id}
            loading={hosts.isLoading}
            empty={narrowedToNothing ? noMatchState : emptyState}
            onRowClick={(host) => navigate(`/hosts/${host.id}`)}
            selection={{ selected, onChange: setSelected }}
          />
        </Card>

        {/* 窄屏：表格换成卡片列表，同样可选择、可进入详情 */}
        <div className="space-y-2.5 md:hidden">
          {hosts.isLoading ? (
            Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-[104px] rounded-card" />)
          ) : filtered.length ? (
            filtered.map((host) => {
              const state = stateById.get(host.id)!
              const cpu = latest(host)?.cpu_pct
              return (
                <Card
                  key={host.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/hosts/${host.id}`)}
                  className={cn('cursor-pointer p-3.5', selected.has(host.id) && 'shadow-raise')}
                >
                  <div className="flex items-start gap-2.5">
                    <span onClick={(event) => event.stopPropagation()} className="pt-0.5">
                      <Checkbox
                        checked={selected.has(host.id)}
                        aria-label={`选择主机 ${host.name}`}
                        onCheckedChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(host.id)) next.delete(host.id)
                            else next.add(host.id)
                            return next
                          })
                        }
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Dot tone={STATE_TONE[state]} idle={state === 'unknown' || state === 'sampling'} />
                        <b className="truncate text-[13px] font-semibold">{host.name}</b>
                      </div>
                      <HostConnection host={host} className="mt-1" />
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <RouteCell host={host} byId={byId} />
                        <TagsCell tags={host.tags} />
                        {cpu != null && <Meter value={cpu} />}
                      </div>
                    </div>
                    {hostMenu(host)}
                  </div>
                </Card>
              )
            })
          ) : (
            <Card>{narrowedToNothing ? noMatchState : emptyState}</Card>
          )}
        </div>
      </motion.div>

      <HostSheet
        host={detail}
        hosts={list}
        latestByHost={metrics}
        testing={testing}
        onClose={() => navigate('/hosts')}
        onTest={(host) => void test(host)}
        onEdit={openEdit}
        onReset={askReset}
        onDelete={(host) => setConfirm({ kind: 'delete', host })}
        onToggleMonitor={(host, enabled) => toggleMonitor.mutate({ host, enabled })}
      />

      <HostFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        hosts={list}
        onSaved={(host) => {
          if (editing) return
          // 新建成功直接打开详情：下一步最常做的就是「测试连接」。先把新主机写进列表缓存，
          // 详情面板不必等重拉回来才能打开
          queryClient.setQueryData<Host[]>(queryKeys.hosts, (prev) =>
            prev && !prev.some((item) => item.id === host.id) ? [...prev, host] : prev,
          )
          navigate(`/hosts/${host.id}`)
        }}
      />

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button size="sm" onClick={() => void testAll(list.filter((host) => selected.has(host.id)))}>
          <PlugsConnected />
          测试
        </Button>
        <Button variant="danger" size="sm" onClick={() => setConfirm({ kind: 'batch-delete' })}>
          <Trash />
          删除
        </Button>
      </SelectionBar>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        icon={confirm?.kind === 'reset' ? <FingerprintSimple weight="bold" /> : <Trash weight="bold" />}
        title={
          confirm?.kind === 'reset'
            ? `重置 ${confirm.host.name} 的主机指纹？`
            : confirm?.kind === 'batch-delete'
              ? `删除所选的 ${selected.size} 台主机？`
              : `删除 ${confirm?.host.name ?? ''}？`
        }
        description={
          confirm?.kind === 'reset' ? (
            <>
              下次连接时，网关会把对方出示的新指纹当作可信记录下来（TOFU）。只有在你确认这台主机
              <b className="font-medium text-ink">刚刚重装过</b>时才这样做——否则这可能是一次中间人攻击。
            </>
          ) : confirm?.kind === 'batch-delete' ? (
            '所选主机及其在各令牌里的授权会一并失效，此操作不可撤销。'
          ) : (
            '这台主机及其在各令牌里的授权会一并失效，此操作不可撤销。'
          )
        }
        confirmText={confirm?.kind === 'reset' ? '重置指纹' : '删除'}
        confirmDisabled={confirm?.kind === 'reset' && resetName.trim() !== confirm.host.name}
        danger
        onConfirm={async () => {
          if (!confirm) return
          if (confirm.kind === 'reset') {
            await resetFingerprint.mutateAsync(confirm.host.id)
            return
          }
          if (confirm.kind === 'delete') {
            await deleteHost.mutateAsync(confirm.host.id)
            dropFromCache([confirm.host.id])
            if (detail?.id === confirm.host.id) navigate('/hosts')
            // 删成功才摘掉选中项：失败时保留，批量条上还能看到它并重试
            setSelected((prev) => {
              if (!prev.has(confirm.host.id)) return prev
              const next = new Set(prev)
              next.delete(confirm.host.id)
              return next
            })
            return
          }
          // 失败的留在选中态：列表刷新后能直接看到哪些没删掉，可立即重试
          const ids = [...selected]
          const { failedIds } = await deleteHosts.mutateAsync(ids)
          dropFromCache(ids.filter((id) => !failedIds.includes(id)))
          setSelected(new Set(failedIds))
        }}
      >
        {confirm?.kind === 'reset' && (
          <div className="space-y-1.5">
            <p className="text-[12.5px] text-ink-2">
              输入主机名 <code className="font-mono text-[12px] text-ink">{confirm.host.name}</code> 以确认
            </p>
            <Input
              value={resetName}
              onChange={(event) => setResetName(event.target.value)}
              placeholder={confirm.host.name}
              autoFocus
              spellCheck={false}
              className="font-mono text-[12.5px]"
            />
          </div>
        )}
      </ConfirmDialog>
    </PageTransition>
  )
}

import {
  ArrowRight,
  DotsThree,
  FingerprintSimple,
  FolderOpen,
  Gauge,
  HardDrives,
  PencilSimple,
  PlugsConnected,
  ShieldCheck,
  Terminal,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCommandRuns, useKeys, useMemories, useMemoryStats, useMetrics } from '@/api/queries'
import type { CommandRun, Host, Metric } from '@/api/types'
import { LogoGlyph } from '@/components/brand/logo'
import { SeriesChart } from '@/components/charts/series-chart'
import { HostConnection } from '@/components/host-connection'
import { Dot, Pill, Tag, type Tone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/code'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Num } from '@/components/ui/number'
import { Segmented } from '@/components/ui/segmented'
import { KeyValues, Sheet, SheetSection } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { HOST_STATE_LABEL, hostState, memPct, type HostState } from '@/lib/calls'
import { cn } from '@/lib/cn'
import { formatAgo, formatBytes, formatDate } from '@/lib/format'
import { spring } from '@/lib/motion'
import { jumpChain, latestOf, STATE_TONE } from './host-utils'

type MetricKey = 'cpu' | 'mem' | 'load'

const valueOf = (point: Metric, key: MetricKey) =>
  key === 'cpu' ? point.cpu_pct : key === 'mem' ? memPct(point) : point.load1

const RUN_TONE: Record<CommandRun['status'], Tone> = {
  running: 'warn',
  succeeded: 'ok',
  failed: 'bad',
  timeout: 'warn',
  cancelled: 'neutral',
  lost: 'neutral',
}

/** 连通状态的一句话描述：给 Sheet 标题下的元信息行与列表副标题共用 */
export function healthLine(host: Host, state: HostState, now = Date.now()) {
  const h = host.health
  if (state === 'online' && h?.online_since) return `连接建立于 ${formatAgo(h.online_since, now)}`
  if (state === 'online') return '最近采样正常'
  if (state === 'offline' && h?.error_at) return `${formatAgo(h.error_at, now)}连接失败`
  if (state === 'offline') return '连接失败'
  if (state === 'sampling') return '等待首次采样'
  return '网关重启后尚未连接过'
}

/**
 * 连接链路：网关 → 跳板（可多级）→ 主机。链路上有一小段光沿虚线流动，表示隧道是通的；
 * 离线时虚线变红、光停下，终点图标也变红。
 */
function ConnectionChain({ host, chain, dead }: { host: Host; chain: Host[]; dead: boolean }) {
  const nodes = [
    { key: 'gw', label: 'OneSSH', icon: <LogoGlyph className="size-[18px]" />, me: true },
    ...chain.map((jump) => ({ key: `j${jump.id}`, label: jump.name, icon: <ShieldCheck />, me: false })),
    { key: 'host', label: host.name, icon: <HardDrives />, me: false },
  ]
  return (
    <div className="flex items-center px-0.5 pt-2 pb-3">
      {nodes.map((node, index) => (
        <div key={node.key} className={cn('flex items-center', index > 0 && 'min-w-0 flex-1')}>
          {index > 0 && (
            <span
              aria-hidden
              className={cn(
                'relative mx-1.5 mb-[22px] h-px min-w-6 flex-1 overflow-hidden',
                dead
                  ? 'bg-[repeating-linear-gradient(90deg,var(--bad)_0_4px,transparent_4px_7px)] opacity-80'
                  : 'bg-[repeating-linear-gradient(90deg,var(--ink-4)_0_4px,transparent_4px_7px)]',
                !dead &&
                  'after:absolute after:-top-px after:h-[3px] after:w-1/5 after:animate-travel after:rounded-[3px] after:bg-ink',
              )}
            />
          )}
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <span
              className={cn(
                'grid size-9 place-items-center rounded-[11px] [&_svg]:size-4',
                node.me
                  ? 'bg-primary text-primary-fg'
                  : cn('bg-surface shadow-card', dead && node.key === 'host' ? 'text-bad' : 'text-ink-2'),
              )}
            >
              {node.icon}
            </span>
            <span className="max-w-24 truncate font-mono text-[11px] text-ink-2">{node.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ResourceSection({ host, offline }: { host: Host; offline: boolean }) {
  const { data: series = [], isLoading } = useMetrics(host.id, 1)
  const [key, setKey] = useState<MetricKey>('cpu')
  const latest = latestOf(series)

  if (!host.monitor_enabled) return null
  if (isLoading) {
    return (
      <SheetSection title="资源 · 近 1 小时">
        <Skeleton className="h-[200px] w-full" />
      </SheetSection>
    )
  }
  if (!latest) {
    return (
      <SheetSection title="资源 · 近 1 小时">
        <p className="py-6 text-center text-[12.5px] text-ink-2">
          {offline ? '主机当前无法连接，还没有采到任何数据。' : '资源监控已开启，正在等待首个采样点。'}
        </p>
      </SheetSection>
    )
  }

  const points = series.map((p) => ({ ts: p.ts, value: valueOf(p, key) }))
  const pct = key !== 'load'
  return (
    <SheetSection
      title="资源 · 近 1 小时"
      actions={
        <Segmented
          size="sm"
          value={key}
          onChange={setKey}
          aria-label="指标"
          options={[
            { value: 'cpu', label: 'CPU' },
            { value: 'mem', label: '内存' },
            { value: 'load', label: '负载' },
          ]}
        />
      }
    >
      <div className="mt-1.5 mb-2.5 grid grid-cols-3 gap-2">
        {[
          { label: 'CPU', value: latest.cpu_pct, suffix: '%', digits: 1, hot: (latest.cpu_pct ?? 0) > 85 },
          { label: '内存', value: memPct(latest), suffix: '%', digits: 1, hot: (memPct(latest) ?? 0) > 80 },
          { label: '负载 1m', value: latest.load1, suffix: '', digits: 2, hot: false },
        ].map((m) => (
          <div key={m.label}>
            <div className="text-[11.5px] text-ink-3">{m.label}</div>
            <div className={cn('text-[20px] font-medium tracking-[-0.02em]', m.hot && 'text-warn')}>
              {m.value == null ? (
                '—'
              ) : (
                <Num value={m.value} suffix={m.suffix} format={{ minimumFractionDigits: m.digits, maximumFractionDigits: m.digits }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <motion.div key={key} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        <SeriesChart
          points={points}
          height={150}
          max={pct ? 100 : undefined}
          unit={pct ? '%' : ''}
          format={(v) => (pct ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v.toFixed(2))}
          ariaLabel={`${host.name} 近 1 小时${key === 'cpu' ? ' CPU' : key === 'mem' ? '内存' : '负载'}曲线`}
        />
      </motion.div>
    </SheetSection>
  )
}

/** df 会列出 /dev、/run 这类内存文件系统和容器挂进来的单个文件，对容量判断只是噪音 */
const PSEUDO_MOUNT = /^\/(dev|proc|sys|run)(\/|$)|^\/etc\/(hosts|hostname|resolv\.conf)$/

function DiskSection({ host }: { host: Host }) {
  const { data: series = [] } = useMetrics(host.id, 1)
  const disks = (latestOf(series)?.disks ?? [])
    .filter((disk) => disk.mount === '/' || (!PSEUDO_MOUNT.test(disk.mount) && disk.total_kb > 0))
    .sort((a, b) => (a.mount === '/' ? -1 : b.mount === '/' ? 1 : b.total_kb - a.total_kb))
  if (!disks.length) return null
  return (
    <SheetSection title="磁盘" sub={`${disks.length} 个挂载点`} bodyClassName="px-1.5 pb-2">
      {disks.map((disk) => {
        const pct = disk.total_kb ? (disk.used_kb / disk.total_kb) * 100 : 0
        return (
          <div key={disk.mount} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3.5 px-2.5 py-2.5 text-[12.5px]">
            <span className="truncate font-mono" title={disk.mount}>
              {disk.mount}
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-well-2" aria-hidden>
              <span
                className={cn('block h-full rounded-full transition-[width] duration-700', pct > 80 ? 'bg-warn' : 'bg-ink-2')}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-right font-mono text-[12px] text-ink-2 tabular-nums">
              {formatBytes(disk.used_kb * 1024)} / {formatBytes(disk.total_kb * 1024)}
            </span>
          </div>
        )
      })}
    </SheetSection>
  )
}

function RecentRuns({ host }: { host: Host }) {
  const navigate = useNavigate()
  const { data: runs = [], isLoading } = useCommandRuns({ host: [host.name], limit: 5 })
  return (
    <SheetSection
      title="最近命令"
      actions={
        <Link to="/activity" className="inline-flex items-center gap-1 transition-colors hover:text-ink">
          全部活动 <ArrowRight size={11} />
        </Link>
      }
      bodyClassName="px-1.5 pb-2"
    >
      {isLoading ? (
        <div className="space-y-2 px-2 py-1.5">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      ) : runs.length === 0 ? (
        <p className="px-2 pt-1 pb-1.5 text-[12.5px] text-ink-3">还没有 Agent 在这台主机上执行过命令。</p>
      ) : (
        runs.map((run) => (
          <button
            key={run.id}
            type="button"
            onClick={() => navigate(`/activity/${run.id}`)}
            className="grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors duration-100 hover:bg-hover-2"
          >
            <Dot tone={RUN_TONE[run.status]} live={run.status === 'running'} />
            <span className="truncate font-mono text-[12px]" title={run.command}>
              {run.command}
            </span>
            <span className="font-mono text-[11.5px] text-ink-3">
              {run.status === 'running'
                ? '运行中'
                : run.exit_code != null && run.exit_code !== 0
                  ? `退出 ${run.exit_code} · ${formatAgo(run.started_at)}`
                  : formatAgo(run.started_at)}
            </span>
          </button>
        ))
      )}
    </SheetSection>
  )
}

function MemorySection({ host }: { host: Host }) {
  const { data: stats = [] } = useMemoryStats()
  const { data: memories = [] } = useMemories({ hostId: host.id, limit: 2 })
  const bank = stats.find((item) => item.host_id === host.id)
  return (
    <SheetSection
      title="记忆"
      sub={
        bank && bank.count > 0 ? (
          <span className="tabular-nums">
            {bank.count} 条{bank.last_written ? ` · 最近写入 ${formatAgo(bank.last_written * 1000)}` : ''}
          </span>
        ) : (
          '暂无'
        )
      }
      actions={
        bank && bank.count > 0 ? (
          <Link to={`/memories?host=${host.id}`} className="inline-flex items-center gap-1 transition-colors hover:text-ink">
            查看 <ArrowRight size={11} />
          </Link>
        ) : undefined
      }
    >
      {memories.length ? (
        <div className="flex flex-col gap-2 pt-0.5">
          {memories.map((memory) => (
            <p key={memory.id} className="text-[12.5px] leading-relaxed text-ink-2">
              {memory.content}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-3">Agent 还没有为这台主机写下任何运维记忆。</p>
      )}
    </SheetSection>
  )
}

/**
 * 主机详情：由路由 /hosts/:id 驱动的右侧悬浮面板。
 * 关闭动画期间路由已经回到 /hosts，所以最后一次的主机要留在 ref 里，内容不会在滑出途中消失。
 */
export function HostSheet({
  host: current,
  hosts,
  latestByHost,
  testing,
  onClose,
  onTest,
  onEdit,
  onReset,
  onDelete,
  onToggleMonitor,
}: {
  host: Host | undefined
  hosts: Host[]
  latestByHost: Map<number, Metric[]>
  testing: ReadonlySet<number>
  onClose: () => void
  onTest: (host: Host) => void
  onEdit: (host: Host) => void
  onReset: (host: Host) => void
  onDelete: (host: Host) => void
  onToggleMonitor: (host: Host, enabled: boolean) => void
}) {
  const navigate = useNavigate()
  const keys = useKeys()
  const last = useRef<Host>()
  if (current) last.current = current
  const host = current ?? last.current
  const byId = useMemo(() => new Map(hosts.map((item) => [item.id, item])), [hosts])

  if (!host) return null
  const state = hostState(host, latestOf(latestByHost.get(host.id)))
  const chain = jumpChain(host, byId)
  const keyName = keys.data?.find((key) => key.id === host.key_id)?.name

  return (
    <Sheet
      open={current != null}
      onOpenChange={(open) => !open && onClose()}
      title={
        <span className="inline-flex items-center gap-2.5">
          <Dot tone={STATE_TONE[state]} live={state === 'online'} idle={state === 'unknown' || state === 'sampling'} />
          {host.name}
        </span>
      }
      status={
        <Pill tone={STATE_TONE[state]} className="shrink-0">
          {state === 'offline' ? '无法连接' : HOST_STATE_LABEL[state]}
        </Pill>
      }
      meta={
        <span className="flex min-w-0 items-center gap-1.5">
          <HostConnection host={host} />
          <span className="shrink-0 text-ink-3">· {healthLine(host, state)}</span>
        </span>
      }
      actions={
        <>
          <Button size="sm" loading={testing.has(host.id)} onClick={() => onTest(host)}>
            <PlugsConnected />
            测试连接
          </Button>
          <Button size="sm" onClick={() => navigate(`/terminal?host=${encodeURIComponent(host.name)}`)}>
            <Terminal />
            终端
          </Button>
          <Button size="sm" onClick={() => navigate(`/files?host=${host.id}`)}>
            <FolderOpen />
            文件
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="更多操作">
                <DotsThree weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(host)}>
                <PencilSimple />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onToggleMonitor(host, !host.monitor_enabled)}>
                <Gauge />
                {host.monitor_enabled ? '关闭资源监控' : '开启资源监控'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger disabled={!host.hostkey_fp} onSelect={() => onReset(host)}>
                <FingerprintSimple />
                重置指纹
              </DropdownMenuItem>
              <DropdownMenuItem danger onSelect={() => onDelete(host)}>
                <Trash />
                删除主机
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {/* 分组依次浮入：比整块一起出现更容易看清面板的结构 */}
      <motion.div
        key={host.id}
        className="flex flex-col gap-2"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } } }}
      >
        {state === 'offline' && (
          <SheetSectionMotion>
            <SheetSection title="连接失败" sub={host.health?.error_at ? formatAgo(host.health.error_at) : undefined}>
              <div className="flex items-start gap-2.5 rounded-[9px] bg-bad-soft p-3 font-mono text-[12px] leading-relaxed break-words text-bad">
                <WarningCircle size={16} className="mt-px shrink-0" />
                <div className="min-w-0">
                  {host.health?.error ?? '最近一次建连失败'}
                  <p className="mt-1.5 font-sans text-[12.5px] text-ink-2">
                    网关会在下一轮监控采样或下一次调用时重试。确认主机恢复后可以手动「测试连接」。
                  </p>
                </div>
              </div>
            </SheetSection>
          </SheetSectionMotion>
        )}

        {host.monitor_enabled ? (
          <SheetSectionMotion>
            <ResourceSection host={host} offline={state === 'offline'} />
          </SheetSectionMotion>
        ) : (
          <SheetSectionMotion>
            <SheetSection>
              <div className="flex flex-col items-center gap-1.5 px-4 pt-5 pb-3 text-center">
                <span className="mb-1.5 grid size-10 place-items-center rounded-[12px] bg-surface text-ink-3 shadow-card">
                  <Gauge size={18} />
                </span>
                <h4 className="text-[13.5px] font-semibold">未开启资源监控</h4>
                <p className="max-w-[36ch] text-[12.5px] leading-relaxed text-ink-2">
                  开启后网关会定期采集 CPU、内存、负载与磁盘，数据保留 7 天。
                </p>
                <Button size="sm" className="mt-2" onClick={() => onToggleMonitor(host, true)}>
                  开启监控
                </Button>
              </div>
            </SheetSection>
          </SheetSectionMotion>
        )}

        <SheetSectionMotion>
          <SheetSection title="连接" sub={chain.length ? `经跳板 ${chain.map((j) => j.name).join(' → ')}` : '直连'}>
            <ConnectionChain host={host} chain={chain} dead={state === 'offline'} />
            <KeyValues
              items={[
                {
                  label: '认证',
                  value:
                    host.auth_type === 'key' ? (
                      <>
                        密钥 · <span className="font-mono text-[12px]">{keyName ?? `#${host.key_id}`}</span>
                      </>
                    ) : (
                      '密码（AES-256-GCM 加密存储）'
                    ),
                },
                {
                  label: '标签',
                  value: host.tags.length ? (
                    <span className="inline-flex flex-wrap gap-1">
                      {host.tags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </span>
                  ) : (
                    <span className="text-ink-3">无</span>
                  ),
                },
                { label: '添加于', value: `${formatDate(host.created_at)} · ${formatAgo(host.created_at * 1000)}` },
              ]}
            />
            <div className="mt-4 mb-2 flex items-baseline justify-between text-[12.5px]">
              <span className="font-semibold">主机指纹</span>
              <span className="text-[12px] text-ink-3">TOFU · 首次连接时记录</span>
            </div>
            {host.hostkey_fp ? (
              <>
                <div className="flex items-center gap-2.5 rounded-[9px] bg-surface py-2 pr-1.5 pl-3 font-mono text-[11.5px] break-all text-ink-2 shadow-card">
                  <FingerprintSimple size={18} className="shrink-0 text-ink-3" />
                  <span className="flex-1">{host.hostkey_fp}</span>
                  <CopyButton value={host.hostkey_fp} label="复制指纹" message="指纹已复制" />
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <p className="flex-1 text-[12px] leading-relaxed text-ink-2">
                    指纹变化时网关会直接拒绝连接。只有确认主机重装过，才需要重置。
                  </p>
                  <Button size="sm" variant="danger" onClick={() => onReset(host)}>
                    重置指纹
                  </Button>
                </div>
              </>
            ) : (
              <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <Dot tone="warn" />
                待首次信任：下一次成功连接时记录对方出示的指纹。
              </p>
            )}
          </SheetSection>
        </SheetSectionMotion>

        <SheetSectionMotion>
          <DiskSection host={host} />
        </SheetSectionMotion>
        <SheetSectionMotion>
          <RecentRuns host={host} />
        </SheetSectionMotion>
        <SheetSectionMotion>
          <MemorySection host={host} />
        </SheetSectionMotion>
      </motion.div>
    </Sheet>
  )
}

function SheetSectionMotion({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="empty:hidden"
      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: spring.soft } }}
    >
      {children}
    </motion.div>
  )
}

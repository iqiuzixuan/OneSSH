import { HardDrives } from '@phosphor-icons/react'
import { useQueries } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { queryKeys, useHosts, useMetrics, useTestHost, useTokens } from '@/api/queries'
import type { Host, Metric } from '@/api/types'
import { ActivityStream, lastHostCommand } from '@/components/activity-stream'
import { HostConnection } from '@/components/host-connection'
import { Chip, Led } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard, StatGroup } from '@/components/ui/stat-card'
import { useEventStream, type StreamEventItem } from '@/hooks/use-event-stream'
import { formatDuration, formatPct } from '@/lib/format'
import { staggerContainer, staggerItem } from '@/lib/motion'

function MetricBar({ label, pct, display }: { label: string; pct: number | null; display: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium tracking-[0.12em] text-faint uppercase">{label}</p>
      <p className="mt-1 text-[15px] leading-none font-semibold text-text tabular-nums">{display}</p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent-gradient transition-[width] duration-700"
          style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
        />
      </div>
    </div>
  )
}

function HostPulseCard({ host, events }: { host: Host; events: StreamEventItem[] }) {
  const navigate = useNavigate()
  const testHost = useTestHost()
  const { data: series = [] } = useMetrics(host.id, 1)
  const metric = series[series.length - 1]
  const memPct =
    metric?.mem_total_kb && metric.mem_used_kb != null
      ? (metric.mem_used_kb / metric.mem_total_kb) * 100
      : null
  const memory = memPct == null ? '—' : `${Math.round(memPct)}%`
  const load = metric?.load1 == null ? '—' : metric.load1.toFixed(2)
  const gradientId = `spark-${host.id}`
  const last = lastHostCommand(events, host.name)

  const test = () => {
    const request = testHost.mutateAsync(host.id)
    toast.promise(request, {
      loading: `正在连接 ${host.name}`,
      success: (result) => result.output || '连接成功',
      error: (error) => (error as Error).message,
    })
    // 错误已由 toast.promise 呈现，这里只负责收敛 loading 状态
    void request.catch(() => {})
  }

  return (
    <motion.div variants={staggerItem} className="h-full">
      <Card className="flex h-full flex-col p-4.5 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-pop">
        <div className="flex items-center gap-2">
          <Led
            tone={last?.running ? 'busy' : metric ? 'on' : host.monitor_enabled ? 'busy' : 'off'}
            pulse={last?.running || (!metric && host.monitor_enabled)}
          />
          <p className="truncate text-sm font-semibold text-text">{host.name}</p>
          <div className="min-w-0 flex-1 [&_button]:mt-0">
            <HostConnection host={host} />
          </div>
          {last?.running ? (
            <Chip tone="warning">任务运行中</Chip>
          ) : metric ? (
            <Chip tone="accent">在线</Chip>
          ) : host.monitor_enabled ? (
            <Chip tone="info">待采样</Chip>
          ) : (
            <Chip>未监控</Chip>
          )}
        </div>

        {metric ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MetricBar label="CPU" pct={metric.cpu_pct ?? null} display={formatPct(metric.cpu_pct)} />
              <MetricBar label="内存" pct={memPct} display={memory} />
              {/* 负载没有百分比上限，按 4.0 截断只作相对指示，数值仍以文字为准 */}
              <MetricBar label="负载" pct={metric.load1 == null ? null : (metric.load1 / 4) * 100} display={load} />
            </div>
            {/* 单个采样点画不出线，只会留一条空白带——数据够两点才铺图 */}
            {series.length > 1 && (
              <div className="mt-3 h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-cpu)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--chart-cpu)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    {/* 留 5 个点的上下余量：既不会把平稳曲线贴到边框上，也不会把小波动放大成假峰 */}
                    <YAxis
                      hide
                      domain={[
                        (min: number) => Math.max(0, min - 5),
                        (max: number) => Math.min(100, max + 5),
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="cpu_pct"
                      stroke="var(--chart-cpu)"
                      strokeWidth={1.5}
                      fill={`url(#${gradientId})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          // 一排破折号既难看又不解释原因，直接换成一句说明——顺带区分「没开监控」和「开了还没采到」
          <p className="mt-4 rounded-control bg-surface-2 px-3 py-2.5 text-[12px] leading-5 text-muted">
            {host.monitor_enabled ? (
              '资源监控已开启，正在等待首个采样点。'
            ) : (
              <>
                未开启资源监控，
                <Link to="/hosts" className="text-accent-ink hover:underline">
                  去主机设置
                </Link>
                中打开后即可采集。
              </>
            )}
          </p>
        )}

        {last && (
          <div className="mt-3 flex items-center gap-1.5 border-t border-dashed border-border pt-2.5 font-mono text-[11.5px] text-muted">
            <span className="font-bold text-accent-ink">$</span>
            <span className="truncate" title={last.text}>
              {last.text}
            </span>
            <span
              className={
                last.running
                  ? 'ml-auto shrink-0 text-[10px] text-warning'
                  : `ml-auto shrink-0 text-[10px] ${last.ok ? 'text-accent-ink' : 'text-danger'}`
              }
            >
              {last.running
                ? '● running'
                : last.durationMs != null
                  ? `完成 · ${formatDuration(last.durationMs)}`
                  : last.ok
                    ? '完成'
                    : '失败'}
            </span>
          </div>
        )}

        <div className="mt-auto flex gap-1.5 pt-3">
          <Button size="sm" variant="ghost" loading={testHost.isPending} onClick={test}>
            测试
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/terminal?host=${encodeURIComponent(host.name)}`)}>
            终端
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/files?host=${host.id}`)}>
            文件
          </Button>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => navigate('/hosts')}>
            详情
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: hosts = [], isLoading } = useHosts()
  const { data: tokens = [] } = useTokens()
  const { events, status } = useEventStream(60)
  const metricQueries = useQueries({
    queries: hosts.map((host) => ({
      queryKey: queryKeys.metrics(host.id, 1),
      queryFn: () => api<Metric[]>(`/metrics/${host.id}?hours=1`),
    })),
  })

  const sampledHosts = metricQueries.filter((query) => (query.data?.length ?? 0) > 0).length
  const monitoredHosts = hosts.filter((host) => host.monitor_enabled).length
  const coverage = hosts.length ? Math.round((monitoredHosts / hosts.length) * 100) : 0

  return (
    <PageTransition>
      <PageHeader eyebrow="Overview" title="运行概览" subtitle="主机资源与网关状态" />

      {isLoading ? (
        <>
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[104px] rounded-container" />
            ))}
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid content-start gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-[210px] rounded-container" />
              ))}
            </div>
            <Skeleton className="h-[420px] rounded-container max-xl:hidden" />
          </div>
        </>
      ) : (
        <>
          <StatGroup className="grid-cols-2 md:grid-cols-4">
            <StatCard
              title="管理主机"
              value={hosts.length}
              suffix="台"
              sub={hosts.length ? `${monitoredHosts} 台开启监控` : undefined}
            />
            <StatCard
              title="有新鲜指标"
              value={sampledHosts}
              suffix="台"
              sub="近 1 小时有采样"
            />
            <StatCard
              title="监控覆盖"
              value={coverage}
              suffix="%"
              sub={hosts.length ? `共 ${hosts.length} 台主机` : undefined}
            />
            <StatCard
              title="活跃令牌"
              value={tokens.length}
              suffix="个"
              sub="MCP 接入凭据"
            />
          </StatGroup>

          {/*
            demo 的 .board：左右两栏顶对齐（items-start），主机卡网格没有额外小节标题，
            否则左侧标题行会把卡片压低、和右侧 Agent Stream 面板错开。
          */}
          <div className="mt-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            {hosts.length ? (
              <motion.div
                className="grid items-stretch gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {hosts.map((host) => (
                  <HostPulseCard key={host.id} host={host} events={events} />
                ))}
              </motion.div>
            ) : (
              <Card>
                <EmptyState
                  icon={<HardDrives size={22} />}
                  title="还没有 SSH 主机"
                  description="添加第一台主机后，这里会显示实时资源脉搏。"
                  action={
                    <Button variant="primary" onClick={() => navigate('/hosts?new=1')}>
                      添加第一台主机
                    </Button>
                  }
                />
              </Card>
            )}

            <ActivityStream events={events} status={status} className="max-xl:max-h-[420px]" />
          </div>
        </>
      )}
    </PageTransition>
  )
}

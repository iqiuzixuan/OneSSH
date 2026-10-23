import { ChartLine, HardDrives, Pulse } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { queryKeys, useHosts } from '@/api/queries'
import type { Host, Metric } from '@/api/types'
import { SeriesChart, type SeriesPoint } from '@/components/charts/series-chart'
import { Dot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Num } from '@/components/ui/number'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { memPct } from '@/lib/calls'
import { cn } from '@/lib/cn'
import { formatAgo, formatBytes } from '@/lib/format'
import { staggerItem } from '@/lib/motion'

type Range = '1h' | '6h' | '24h' | '7d'
const RANGES: { value: Range; label: string; hours: number }[] = [
  { value: '1h', label: '1 小时', hours: 1 },
  { value: '6h', label: '6 小时', hours: 6 },
  { value: '24h', label: '24 小时', hours: 24 },
  { value: '7d', label: '7 天', hours: 168 },
]
/** 时间窗再长，曲线也只画这么多个点：7 天的分钟级采样逐点画出来既慢又看不清 */
const MAX_POINTS = 360
/** 宽度不超过这么多台时用分段控件平铺主机名，再多就收进下拉 */
const SEGMENT_LIMIT = 6

type Key = 'cpu' | 'mem' | 'load'
const valueOf = (m: Metric, key: Key): number | null =>
  key === 'cpu' ? (m.cpu_pct ?? null) : key === 'mem' ? memPct(m) : (m.load1 ?? null)

/** 降采样：按时间桶取最大值——峰值比均值更值得被看见 */
function downsample(series: Metric[], key: Key): SeriesPoint[] {
  const points = series.map((m) => ({ ts: m.ts, value: valueOf(m, key) }))
  if (points.length <= MAX_POINTS) return points
  const size = Math.ceil(points.length / MAX_POINTS)
  const out: SeriesPoint[] = []
  for (let i = 0; i < points.length; i += size) {
    const bucket = points.slice(i, i + size)
    const values = bucket.map((p) => p.value).filter((v): v is number => v != null)
    out.push({ ts: bucket[bucket.length - 1].ts, value: values.length ? Math.max(...values) : null })
  }
  return out
}

function stats(points: SeriesPoint[]) {
  const values = points.map((p) => p.value).filter((v): v is number => v != null)
  if (!values.length) return null
  return {
    max: Math.max(...values),
    min: Math.min(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
  }
}

const CHARTS: { key: Key; label: string; unit: string; digits: number; max?: number; wide?: boolean }[] = [
  { key: 'cpu', label: 'CPU 使用率', unit: '%', digits: 1, max: 100, wide: true },
  { key: 'mem', label: '内存使用率', unit: '%', digits: 1, max: 100 },
  { key: 'load', label: '负载 · 1 分钟', unit: '', digits: 2 },
]

function ChartCard({
  label,
  unit,
  digits,
  max,
  wide,
  points,
  current,
}: {
  label: string
  unit: string
  digits: number
  max?: number
  wide?: boolean
  points: SeriesPoint[]
  current: number | null
}) {
  const s = stats(points)
  const fmt = (v: number) => `${v.toFixed(digits)}${unit}`
  return (
    <motion.div variants={staggerItem} className={cn(wide && 'lg:col-span-2')}>
      <Card className="p-1.5">
        <div className="flex items-end justify-between gap-4 px-2.5 pt-2.5 pb-2">
          <div>
            <div className="text-[12.5px] text-ink-2">{label}</div>
            <div className="mt-1 text-[26px] leading-[1.1] font-medium tracking-[-0.03em]">
              {current == null ? (
                <span className="text-ink-3">—</span>
              ) : (
                <Num value={Number(current.toFixed(digits))} suffix={unit} format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }} />
              )}
            </div>
          </div>
          {s && (
            <div className="text-right font-mono text-[11.5px] leading-relaxed text-ink-3">
              最高 {fmt(s.max)}
              <br />
              平均 {fmt(s.avg)} · 最低 {fmt(s.min)}
            </div>
          )}
        </div>
        <div className="mx-1.5 mb-1">
          <SeriesChart
            points={points}
            height={wide ? 200 : 160}
            max={max}
            unit={unit}
            format={(v) => v.toFixed(unit === '%' ? 0 : digits)}
            ariaLabel={label}
          />
        </div>
      </Card>
    </motion.div>
  )
}

/** df 会把 /dev、/proc 这类伪文件系统与容器的 bind mount 一并列出，它们的占用没有参考价值 */
const PSEUDO_MOUNT = /^\/(dev|proc|sys|run)(\/|$)|^\/etc\//

function DiskCard({ latest }: { latest?: Metric }) {
  const all = latest?.disks ?? []
  const real = all.filter((d) => d.total_kb > 0 && !PSEUDO_MOUNT.test(d.mount))
  const disks = real.length ? real : all
  return (
    <motion.div variants={staggerItem}>
      <Card className="h-full p-1.5">
        <div className="px-2.5 pt-2.5 pb-1 text-[12.5px] text-ink-2">磁盘</div>
        {disks.length === 0 ? (
          <p className="px-2.5 pb-3 text-[12.5px] text-ink-3">没有采到挂载点。</p>
        ) : (
          <div className="pb-1.5">
            {disks.map((disk) => {
              const pct = disk.total_kb ? (disk.used_kb / disk.total_kb) * 100 : 0
              return (
                <div key={disk.mount} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_auto] items-center gap-3.5 px-2.5 py-2.5 text-[12.5px]">
                  <span className="truncate font-mono" title={disk.mount}>
                    {disk.mount}
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-well-2" aria-hidden>
                    <motion.span
                      className={cn('block h-full rounded-full', pct > 90 ? 'bg-bad' : pct > 80 ? 'bg-warn' : 'bg-ink-2')}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ type: 'spring', visualDuration: 0.6, bounce: 0 }}
                    />
                  </span>
                  <span className="text-right font-mono text-[12px] text-ink-2">
                    {pct.toFixed(0)}% · {formatBytes(disk.used_kb * 1024)} / {formatBytes(disk.total_kb * 1024)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </motion.div>
  )
}

export function MetricsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: hosts = [], isLoading: hostsLoading } = useHosts()
  const range = (RANGES.find((r) => r.value === params.get('range'))?.value ?? '1h') as Range
  const hours = RANGES.find((r) => r.value === range)!.hours

  // 开了监控的在前、在线的在前：默认落在最可能有数据的那台
  const ordered = useMemo(
    () =>
      [...hosts].sort(
        (a, b) =>
          Number(b.monitor_enabled) - Number(a.monitor_enabled) ||
          Number(b.health?.state === 'online') - Number(a.health?.state === 'online') ||
          a.name.localeCompare(b.name),
      ),
    [hosts],
  )
  const hostParam = Number(params.get('host'))
  const host: Host | undefined = hosts.find((h) => h.id === hostParam) ?? ordered.find((h) => h.monitor_enabled)

  // 没有指定主机时把默认选择写回 URL，刷新与分享都落在同一台
  useEffect(() => {
    if (!params.get('host') && host) {
      const next = new URLSearchParams(params)
      next.set('host', String(host.id))
      setParams(next, { replace: true })
    }
  }, [host, params, setParams])

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next, { replace: true })
  }

  const metrics = useQuery({
    queryKey: queryKeys.metrics(host?.id ?? 0, hours),
    queryFn: () => api<Metric[]>(`/metrics/${host!.id}?hours=${hours}`),
    enabled: host != null,
    refetchInterval: 30_000,
  })
  const series = metrics.data ?? []
  const latest = series[series.length - 1]
  const monitored = ordered.filter((h) => h.monitor_enabled)

  const picker =
    monitored.length > 0 && monitored.length <= SEGMENT_LIMIT && (!host || host.monitor_enabled) ? (
      <Segmented
        value={String(host?.id ?? '')}
        onChange={(v) => set('host', v)}
        aria-label="主机"
        options={monitored.map((h) => ({
          value: String(h.id),
          label: <span className="font-mono text-[12px]">{h.name}</span>,
        }))}
      />
    ) : (
      <Select
        className="w-56"
        value={host?.id}
        onChange={(id) => set('host', String(id))}
        aria-label="主机"
        placeholder="选择主机"
        options={ordered.map((h) => ({ value: h.id, label: h.name, description: h.monitor_enabled ? undefined : '未监控' }))}
      />
    )

  return (
    <PageTransition>
      <PageHeader
        title="指标"
        description="网关按周期经 SSH 采集 Linux 的 CPU、内存、负载与磁盘，保留 7 天。远端不需要安装任何代理。"
        actions={
          <Segmented
            value={range}
            onChange={(v) => set('range', v)}
            aria-label="时间窗"
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          />
        }
      />

      <motion.div variants={staggerItem} className="mb-3 flex flex-wrap items-center gap-2.5">
        {hostsLoading ? <Skeleton className="h-8 w-80" /> : hosts.length > 0 && picker}
        {latest && (
          <span className="ml-auto inline-flex items-center gap-2 text-[12px] text-ink-3">
            <Dot tone="ok" live />
            最近采样 {formatAgo(latest.ts)}
          </span>
        )}
      </motion.div>

      {!hostsLoading && hosts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HardDrives />}
            title="还没有主机"
            description="添加主机并开启资源监控后，这里会出现 CPU、内存、负载与磁盘的趋势。"
            action={
              <Button variant="primary" onClick={() => navigate('/hosts?new=1')}>
                添加主机
              </Button>
            }
          />
        </Card>
      ) : !host ? (
        <Card>
          <EmptyState
            icon={<ChartLine />}
            title="没有主机开启资源监控"
            description="只有开启了「资源监控」的主机会持续采样。在主机详情里打开它即可。"
            action={<Button onClick={() => navigate('/hosts')}>去主机列表</Button>}
          />
        </Card>
      ) : !host.monitor_enabled ? (
        <Card>
          <EmptyState
            icon={<ChartLine />}
            title={`${host.name} 未开启资源监控`}
            description="打开后网关会按周期采集 CPU、内存、负载与磁盘；历史从开启那一刻开始累积。"
            action={
              <Button variant="primary" onClick={() => navigate(`/hosts/${host.id}`)}>
                去主机详情开启
              </Button>
            }
          />
        </Card>
      ) : metrics.isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-[290px] rounded-card lg:col-span-2" />
          <Skeleton className="h-[250px] rounded-card" />
          <Skeleton className="h-[250px] rounded-card" />
        </div>
      ) : series.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Pulse />}
            title="暂无采样数据"
            description={
              host.health?.state === 'offline'
                ? `${host.name} 当前无法连接：${host.health.error ?? '最近一次建连失败'}`
                : '监控已开启，正在等待首次采集。这个时间窗内还没有采样点。'
            }
          />
        </Card>
      ) : (
        <div className={cn('grid gap-3 transition-opacity duration-150 lg:grid-cols-2', metrics.isFetching && metrics.isPlaceholderData && 'opacity-60')}>
          {CHARTS.map((chart) => (
            <ChartCard
              key={`${host.id}-${chart.key}`}
              label={chart.label}
              unit={chart.unit}
              digits={chart.digits}
              max={chart.max}
              wide={chart.wide}
              points={downsample(series, chart.key)}
              current={latest ? valueOf(latest, chart.key) : null}
            />
          ))}
          <DiskCard latest={latest} />
        </div>
      )}
    </PageTransition>
  )
}

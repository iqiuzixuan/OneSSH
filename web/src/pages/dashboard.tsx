import {
  ArrowBendDownRight,
  ArrowRight,
  CaretRight,
  CheckCircle,
  HardDrives,
  Prohibit,
  Pulse,
  Ticket,
  WarningCircle,
  WifiSlash,
} from '@phosphor-icons/react'
import { useQueries } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useLive } from '@/api/live'
import { queryKeys, useAudit, useCommandRuns, useHosts, useJobs, useOverview, useTokens } from '@/api/queries'
import type { CommandRun, Host, Metric } from '@/api/types'
import { CallRow, LiveRows } from '@/components/call-row'
import { Sparkline, MiniBars } from '@/components/charts/sparkline'
import { FlowStrip, type FlowAgent, type FlowHost } from '@/components/overview/flow-strip'
import { Dot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, SectionHeader, Well } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Num } from '@/components/ui/number'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Skeleton } from '@/components/ui/skeleton'
import { Kpi } from '@/components/ui/stat-card'
import { Tooltip } from '@/components/ui/tooltip'
import { callFromAudit, callFromEvent, hostState, memPct, mergeCalls, type CallItem } from '@/lib/calls'
import { cn } from '@/lib/cn'
import { formatAgo, formatDuration } from '@/lib/format'
import { staggerItem } from '@/lib/motion'

const HOUR = 3_600_000
const WEEKDAY = '日一二三四五六'

/** 每 5 秒推进一次的「现在」：每分钟调用数、运行时长这类相对量据此重算 */
function useNow(interval = 5000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(timer)
  }, [interval])
  return now
}

type Attention = { key: string; tone: 'bad' | 'warn'; icon: React.ReactNode; title: string; desc: React.ReactNode; to: string }

function AttentionList({ items }: { items: Attention[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 px-4 pt-10 pb-12 text-center">
        <CheckCircle size={22} weight="fill" className="mb-1.5 text-ok" />
        <p className="text-[13px] font-medium">一切正常</p>
        <p className="text-[12px] text-ink-2">没有离线的主机、失败的命令或越权尝试。</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col px-1.5 pb-1.5">
      {items.map((item) => (
        <Link key={item.key} to={item.to} className="group/attn flex gap-3 rounded-well p-2.5 transition-colors duration-150 hover:bg-hover">
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-[8px] [&_svg]:size-[15px]',
              item.tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn',
            )}
          >
            {item.icon}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] leading-snug font-medium">{item.title}</div>
            <div className="mt-0.5 truncate text-[12px] leading-normal text-ink-2">{item.desc}</div>
          </div>
          <CaretRight
            size={14}
            className="ml-auto shrink-0 self-center text-ink-3 transition-[transform,color] duration-200 group-hover/attn:translate-x-0.5 group-hover/attn:text-ink"
          />
        </Link>
      ))}
    </div>
  )
}

function HostCard({
  host,
  series,
  via,
  lastRun,
}: {
  host: Host
  series: Metric[]
  via?: string
  lastRun?: CommandRun
}) {
  const latest = series[series.length - 1]
  const state = hostState(host, latest)
  const mem = memPct(latest)
  const cpu = latest?.cpu_pct ?? null
  return (
    <motion.div variants={staggerItem}>
      <Link
        to={`/hosts/${host.id}`}
        className={cn(
          'flex h-full flex-col rounded-card bg-surface p-1.5 shadow-card',
          'transition-[box-shadow,transform] duration-[250ms] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-raise active:translate-y-0 active:scale-[0.99]',
        )}
      >
        <div className="flex min-w-0 items-center gap-2 px-2 pt-2 pb-2.5">
          <Dot tone={state === 'online' ? 'ok' : state === 'offline' ? 'bad' : 'neutral'} idle={state === 'unknown' || state === 'sampling'} />
          <b className="truncate text-[13px] font-semibold">{host.name}</b>
          {via ? (
            <Tooltip content={`经跳板 ${via} 连接`}>
              <span className="ml-auto inline-flex items-center gap-[3px] font-mono text-[11px] whitespace-nowrap text-ink-3">
                <ArrowBendDownRight size={12} />
                {via}
              </span>
            </Tooltip>
          ) : (
            <span className="ml-auto truncate font-mono text-[11px] text-ink-3">{host.tags.join(' · ')}</span>
          )}
        </div>
        <Well className="overflow-hidden px-2.5 pt-2.5">
          {latest ? (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { k: 'CPU', v: cpu, hot: (cpu ?? 0) > 85, suffix: '%', digits: 0 },
                  { k: '内存', v: mem, hot: (mem ?? 0) > 80, suffix: '%', digits: 0 },
                  { k: '负载', v: latest.load1 ?? null, hot: false, suffix: '', digits: 2 },
                ].map((m) => (
                  <div key={m.k}>
                    <div className="text-[11px] text-ink-3">{m.k}</div>
                    <div className={cn('mt-px text-[15px] font-medium tracking-[-0.01em]', m.hot && 'text-warn')}>
                      {m.v == null ? (
                        '—'
                      ) : (
                        <Num
                          value={m.digits ? m.v : Math.round(m.v)}
                          suffix={m.suffix}
                          format={{ minimumFractionDigits: m.digits, maximumFractionDigits: m.digits }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Sparkline values={series.slice(-40).map((p) => p.cpu_pct ?? 0)} className="-mx-2.5 mt-1.5 w-[calc(100%+20px)]" />
            </>
          ) : (
            <p className="pb-2.5 text-[12px] leading-5 text-ink-2">
              {state === 'offline' ? '主机当前无法连接。' : '资源监控已开启，正在等待首个采样点。'}
            </p>
          )}
        </Well>
        <div className="flex min-w-0 items-center gap-1.5 px-2 pt-[9px] pb-[5px] font-mono text-[11.5px] text-ink-2">
          {lastRun ? (
            <>
              <span className="truncate">
                <span className="text-ink-3">$ </span>
                {lastRun.command}
              </span>
              <span className="ml-auto shrink-0 text-ink-3">
                {lastRun.status === 'running' ? <Dot tone="warn" live label="运行中" /> : formatAgo(lastRun.started_at)}
              </span>
            </>
          ) : (
            <span className="text-ink-3">暂无命令记录</span>
          )}
        </div>
      </Link>
    </motion.div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const now = useNow()
  const { events, status } = useLive()
  const { data: hosts = [], isLoading: hostsLoading } = useHosts()
  const { data: tokens = [] } = useTokens()
  const { data: overview } = useOverview(24)
  const { data: lastHour } = useOverview(1)
  const { data: jobs = [] } = useJobs({ live: false })
  const { data: audit = [] } = useAudit({ limit: 100 })
  const { data: failed = [] } = useAudit({ ok: false, denied: false, limit: 6 })
  const { data: denied = [] } = useAudit({ denied: true, limit: 2 })
  const { data: runs = [] } = useCommandRuns({ limit: 60 })

  const summary = overview?.summary
  const hostById = useMemo(() => new Map(hosts.map((h) => [h.id, h])), [hosts])

  // 卡片区：开了监控的主机，在线优先、活跃优先，最多 8 张
  const callsByHost = useMemo(() => new Map(summary?.hosts.map((h) => [h.host, h]) ?? []), [summary])
  const cardHosts = useMemo(
    () =>
      hosts
        .filter((h) => h.monitor_enabled)
        .sort(
          (a, b) =>
            Number(b.health?.state === 'online') - Number(a.health?.state === 'online') ||
            (callsByHost.get(b.name)?.calls ?? 0) - (callsByHost.get(a.name)?.calls ?? 0) ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 8),
    [hosts, callsByHost],
  )
  const metricQueries = useQueries({
    queries: cardHosts.map((host) => ({
      queryKey: queryKeys.metrics(host.id, 1),
      queryFn: () => api<Metric[]>(`/metrics/${host.id}?hours=1`),
      refetchInterval: 30_000,
    })),
  })
  const seriesOf = (id: number) => metricQueries[cardHosts.findIndex((h) => h.id === id)]?.data ?? []
  // useQueries 每次渲染都返回新数组，用各查询的更新时间拼一个稳定的依赖值
  const metricsStamp = metricQueries.map((q) => q.dataUpdatedAt).join()

  const lastRunByHost = useMemo(() => {
    const map = new Map<string, CommandRun>()
    for (const run of runs) if (!map.has(run.host)) map.set(run.host, run)
    return map
  }, [runs])

  // 实时事件 + 最近审计合并去重：实时流断线时也不会空
  const calls: CallItem[] = useMemo(
    () =>
      mergeCalls(
        events.map(callFromEvent).filter((c): c is CallItem => c != null),
        audit.map(callFromAudit),
        120,
      ),
    [events, audit],
  )
  const rate = calls.filter((c) => now - c.ts < 60_000).length
  const deniedHour = lastHour?.summary.denied ?? 0

  const tokenStats = useMemo(() => new Map(summary?.tokens.map((t) => [t.token_id, t]) ?? []), [summary])
  const agents: FlowAgent[] = useMemo(
    () =>
      tokens
        .map((t) => ({ t, stat: tokenStats.get(t.id) }))
        .sort((a, b) => (b.stat?.calls ?? 0) - (a.stat?.calls ?? 0) || a.t.name.localeCompare(b.t.name))
        .slice(0, 6)
        .map(({ t, stat }) => ({
          key: String(t.id),
          name: t.name,
          calls: stat?.calls ?? 0,
          quiet: !stat || now - stat.last_at > HOUR,
        })),
    [tokens, tokenStats, now],
  )
  const flowHostsAll: FlowHost[] = useMemo(
    () =>
      [...hosts]
        .sort((a, b) => (callsByHost.get(b.name)?.calls ?? 0) - (callsByHost.get(a.name)?.calls ?? 0) || a.name.localeCompare(b.name))
        .map((h) => {
          const series = seriesOf(h.id)
          return { id: h.id, name: h.name, state: hostState(h, series[series.length - 1]), cpu: series[series.length - 1]?.cpu_pct ?? null }
        }),
    [hosts, callsByHost, metricsStamp],
  )
  const flowHosts = flowHostsAll.slice(0, 10)

  const offline = hosts.filter((h) => h.health?.state === 'offline')
  const activeAgents = new Set(calls.filter((c) => now - c.ts < HOUR && c.token).map((c) => c.token)).size
  const activeHosts = new Set(calls.filter((c) => now - c.ts < HOUR && c.host).map((c) => c.host)).size
  const sentence =
    activeAgents === 0
      ? `过去 1 小时没有 Agent 调用，网关安静待命中${offline.length ? `；${offline.length} 台主机无法连接` : ''}。`
      : `${activeAgents} 个 Agent 正在 ${activeHosts} 台主机上工作。过去 1 小时网关拒绝了 ${deniedHour} 次越权调用${
          offline.length ? `，${offline.length} 台主机无法连接` : ''
        }。`

  const runningJobs = jobs.filter((j) => j.job.status === 'running').sort((a, b) => a.job.started_at - b.job.started_at)
  const longest = runningJobs[0]
  const cmd = summary?.commands
  const successRate = cmd && cmd.succeeded + cmd.failed > 0 ? (cmd.succeeded / (cmd.succeeded + cmd.failed)) * 100 : null
  const buckets = summary?.buckets ?? []
  const peak = buckets.reduce((best, b) => (b.calls > (best?.calls ?? -1) ? b : best), buckets[0])

  const attention: Attention[] = [
    ...offline.map((h) => ({
      key: `off-${h.id}`,
      tone: 'bad' as const,
      icon: <WifiSlash weight="bold" />,
      title: `${h.name} 无法连接`,
      desc: <code className="font-mono text-[11.5px]">{h.health?.error ?? '最近一次建连失败'}</code>,
      to: `/hosts/${h.id}`,
    })),
    ...failed
      .filter((a, i, all) => all.findIndex((b) => b.Host.String === a.Host.String && b.ParamsJSON === a.ParamsJSON) === i)
      .map((a) => {
      const call = callFromAudit(a)
      return {
        key: `fail-${a.ID}`,
        tone: 'warn' as const,
        icon: <WarningCircle weight="bold" />,
        title: call.host ? `${call.host} 上的 ${call.tool} 失败` : `${call.tool} 失败`,
        desc: `${call.token ?? '未知令牌'} · ${call.summary}${call.exitCode != null ? ` · 退出码 ${call.exitCode}` : ''}`,
        to: call.runIds[0] ? `/activity/${call.runIds[0]}` : '/activity?result=failed',
      }
    }),
    ...denied.map((a) => {
      const call = callFromAudit(a)
      return {
        key: `deny-${a.ID}`,
        tone: 'bad' as const,
        icon: <Prohibit weight="bold" />,
        title: `${call.token ?? '未知令牌'} 试图${call.host ? `访问 ${call.host}` : `调用 ${call.tool}`}`,
        desc: `${formatAgo(call.ts, now)} · 不在该令牌的授权范围内，网关已拒绝`,
        to: '/activity?result=denied',
      }
    }),
  ].slice(0, 5)

  const date = new Date(now)
  const eyebrow = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} · 星期${WEEKDAY[date.getDay()]}`

  return (
    <PageTransition>
      <PageHeader
        eyebrow={eyebrow}
        title="概览"
        description={summary ? sentence : '正在汇总网关最近的调用…'}
        actions={
          <>
            <span className="inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] text-ink-2">
              <Dot tone={status === 'open' ? 'ok' : 'warn'} live={status === 'open'} />
              {status === 'open' ? '实时' : '重连中'}
            </span>
            <Button onClick={() => navigate('/activity')}>
              <Pulse />
              全部活动
            </Button>
            <Button variant="primary" onClick={() => navigate('/tokens/new')}>
              <Ticket />
              签发令牌
            </Button>
          </>
        }
      />

      <motion.div variants={staggerItem}>
        <FlowStrip
          agents={agents}
          hosts={flowHosts}
          hiddenHosts={Math.max(0, flowHostsAll.length - flowHosts.length)}
          rate={rate}
          deniedHour={deniedHour}
          onHostClick={(id) => navigate(`/hosts/${id}`)}
        />
      </motion.div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="调用 · 24 小时"
          value={summary?.calls ?? 0}
          foot={peak && peak.calls > 0 ? `峰值 ${new Date(peak.start).getHours()}:00 · ${peak.calls} 次` : '暂无调用'}
          aside={<MiniBars values={buckets.map((b) => b.calls)} />}
        />
        <Kpi
          label="被网关拒绝"
          dot={{ tone: (summary?.denied ?? 0) > 0 ? 'bad' : 'neutral' }}
          value={summary?.denied ?? 0}
          tone={(summary?.denied ?? 0) > 0 ? 'bad' : undefined}
          foot={
            summary && summary.calls > 0 && summary.denied > 0
              ? `占全部调用 ${((summary.denied / summary.calls) * 100).toFixed(1)}%`
              : '权限边界内一切正常'
          }
          aside={summary && summary.denied > 0 ? <MiniBars values={buckets.map((b) => b.denied)} tone="bad" /> : undefined}
        />
        <Kpi
          label="命令执行"
          value={cmd?.total ?? 0}
          foot={successRate != null ? `成功率 ${successRate.toFixed(1)}%` : '24 小时内没有命令'}
          aside={
            successRate != null ? (
              <span className="block h-1 w-[88px] overflow-hidden rounded-full bg-bad-soft" aria-hidden>
                <span className="block h-full rounded-full bg-ink-2 transition-[width] duration-700" style={{ width: `${successRate}%` }} />
              </span>
            ) : undefined
          }
        />
        <Kpi
          label="运行中任务"
          dot={{ tone: runningJobs.length ? 'warn' : 'neutral', live: runningJobs.length > 0 }}
          value={runningJobs.length}
          foot={
            longest
              ? `最长 ${formatDuration(now - longest.job.started_at * 1000)} · ${hostById.get(longest.job.host_id)?.name ?? '主机'}`
              : '没有后台任务在跑'
          }
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <motion.div variants={staggerItem}>
          <Card className="h-full">
            <CardHeader
              title="实时动态"
              actions={
                <Link to="/activity" className="inline-flex items-center gap-1 text-[12px] text-ink-3 transition-colors hover:text-ink">
                  查看全部 <ArrowRight size={12} />
                </Link>
              }
            />
            {calls.length === 0 ? (
              <EmptyState icon={<Pulse />} title="还没有调用" description="Agent 通过 MCP 调用网关后，每一次调用都会实时出现在这里。" />
            ) : (
              <LiveRows
                items={calls.slice(0, 8)}
                rowHeight={38}
                className="px-1.5 pb-1.5"
                render={(call) => (
                  <CallRow
                    call={call}
                    onClick={() => navigate(call.runIds[0] ? `/activity/${call.runIds[0]}` : '/activity')}
                  />
                )}
              />
            )}
          </Card>
        </motion.div>
        <motion.div variants={staggerItem}>
          <Card className="h-full">
            <CardHeader title="需要留意" actions={<span className="text-[12px] text-ink-3">{attention.length ? `${attention.length} 项` : ''}</span>} />
            <AttentionList items={attention} />
          </Card>
        </motion.div>
      </div>

      <motion.div variants={staggerItem}>
        <SectionHeader
          title="主机"
          actions={
            <Link to="/hosts" className="group/more inline-flex items-center gap-1 text-[12.5px] text-ink-2 transition-colors hover:text-ink">
              全部 {hosts.length} 台
              <ArrowRight size={12} className="transition-transform duration-200 group-hover/more:translate-x-0.5" />
            </Link>
          }
        />
      </motion.div>
      {hostsLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-card" />
          ))}
        </div>
      ) : cardHosts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HardDrives />}
            title={hosts.length ? '还没有主机开启资源监控' : '还没有主机'}
            description={hosts.length ? '在主机详情里打开「资源监控」，这里就会出现 CPU、内存与负载。' : '添加第一台主机后，Agent 才有地方可去。'}
            action={
              <Button variant="primary" onClick={() => navigate(hosts.length ? '/hosts' : '/hosts?new=1')}>
                {hosts.length ? '去主机列表' : '添加主机'}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cardHosts.map((host) => (
            <HostCard
              key={host.id}
              host={host}
              series={seriesOf(host.id)}
              via={host.jump_host_id ? hostById.get(host.jump_host_id)?.name : undefined}
              lastRun={lastRunByHost.get(host.name)}
            />
          ))}
        </div>
      )}
    </PageTransition>
  )
}

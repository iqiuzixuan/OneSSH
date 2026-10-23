import { ArrowClockwise, Broadcast, MagnifyingGlass, Stop, WarningCircle, X } from '@phosphor-icons/react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCommandRuns, useHosts, useJobs, useKillJob, useKillJobs } from '@/api/queries'
import type { CommandRun, JobStatus } from '@/api/types'
import { JobCard } from '@/components/jobs/job-card'
import { JobLogsSheet } from '@/components/jobs/job-logs-sheet'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Segmented } from '@/components/ui/segmented'
import { SelectionBar } from '@/components/ui/selection-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { staggerContainer, staggerItem } from '@/lib/motion'

/** exited / killed 都是「跑完了」，归并成一档 */
type StatusFilter = 'all' | 'running' | 'ended' | 'lost'
const FILTERS: StatusFilter[] = ['all', 'running', 'ended', 'lost']

const matches = (item: JobStatus, filter: StatusFilter) =>
  filter === 'all' ||
  (filter === 'running' && item.job.status === 'running') ||
  (filter === 'ended' && (item.job.status === 'exited' || item.job.status === 'killed')) ||
  (filter === 'lost' && item.job.status === 'lost')

/** 有任务在跑时每秒推进一次「现在」，耗时随之滚动；全部结束后停表 */
function useTicker(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

export function JobsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const jobs = useJobs()
  const { data: hosts = [] } = useHosts()
  // 任务本身不记录令牌：用启动它的那次 job_start 命令运行补上，并能跳回调用记录
  const { data: starts = [] } = useCommandRuns({ tool: ['job_start'], limit: 200 })
  const killJob = useKillJob()
  const killJobs = useKillJobs()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmJobId, setConfirmJobId] = useState<string | null>(null)
  const [batchConfirm, setBatchConfirm] = useState(false)

  const filterParam = search.get('status') as StatusFilter | null
  const filter: StatusFilter = filterParam && FILTERS.includes(filterParam) ? filterParam : 'all'
  const query = search.get('q') ?? ''
  const jobParam = search.get('job')
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search)
    if (value == null || value === '' || value === 'all') next.delete(key)
    else next.set(key, value)
    setSearch(next, { replace: key !== 'job' })
  }

  const all = jobs.data ?? []
  const hostName = useMemo(() => new Map(hosts.map((h) => [h.id, h.name])), [hosts])
  const runByJob = useMemo(() => {
    const map = new Map<string, CommandRun>()
    for (const run of starts) if (run.job_id) map.set(run.job_id, run)
    return map
  }, [starts])
  const anyRunning = all.some((item) => item.job.status === 'running')
  const now = useTicker(anyRunning)

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, all.filter((item) => matches(item, f)).length])) as Record<StatusFilter, number>,
    [all],
  )
  // 运行中置顶，其余按开始时间倒序
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((item) => matches(item, filter))
      .filter((item) => !q || `${item.job.command} ${item.job.id} ${hostName.get(item.job.host_id) ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.job.status === 'running') - Number(a.job.status === 'running') || b.job.started_at - a.job.started_at)
  }, [all, filter, query, hostName])

  // 列表每 4 秒轮询：已结束的任务留在选中态只会误导下一次批量终止，随数据自动剔除。
  // 只剔除「响应里确实存在且已不再 running」的任务——暂时缺席的 id（批量终止失败后的重试目标）要留着
  useEffect(() => {
    if (!jobs.data) return
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const settled = new Set(jobs.data.filter((item) => item.job.status !== 'running').map((item) => item.job.id))
      const next = new Set([...prev].filter((id) => !settled.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [jobs.data])

  /**
   * 刷新按钮的旋转只由点击驱动，一圈转满才停；请求还在飞就接着转下一圈。
   * 本地网关常在几十毫秒内返回，把 isFetching 直接绑到旋转只会抖一下，4 秒轮询还会让它无故自转。
   */
  const rotate = useMotionValue(0)
  const reduce = useReducedMotion()
  const fetching = useRef(false)
  const spinning = useRef(false)
  const refresh = async () => {
    if (!fetching.current) {
      fetching.current = true
      void jobs.refetch().finally(() => {
        fetching.current = false
      })
    }
    if (reduce || spinning.current) return
    spinning.current = true
    do {
      await animate(rotate, rotate.get() + 360, { duration: 0.55, ease: 'easeInOut' })
    } while (fetching.current)
    spinning.current = false
  }

  // 日志面板：?job=ID 驱动；列表里找不到（已被清理）时用只带 id 的占位，日志照样能按 id 拉
  const lastJob = useRef<string | null>(null)
  if (jobParam) lastJob.current = jobParam
  const sheetId = jobParam ?? lastJob.current
  const sheetJob: JobStatus | null = sheetId
    ? (all.find((item) => item.job.id === sheetId) ?? {
        job: { id: sheetId, host_id: 0, command: '', cwd: '', status: 'exited', exit_code: null, started_at: 0, finished_at: null },
        log_bytes: 0,
      })
    : null

  const isEmpty = !jobs.isLoading && !jobs.isError && all.length === 0

  return (
    <PageTransition>
      <PageHeader
        title="任务"
        description="后台任务在远端以独立进程组运行，网关重启或断线都不受影响；远端不留常驻组件。"
        actions={
          <Button onClick={() => void refresh()}>
            <motion.span className="inline-flex" style={{ rotate }}>
              <ArrowClockwise />
            </motion.span>
            刷新
          </Button>
        }
      />

      {!isEmpty && !jobs.isError && (
        <motion.div variants={staggerItem} className="mb-3 flex flex-wrap items-center gap-2.5">
          <Segmented
            value={filter}
            onChange={(value) => setParam('status', value)}
            aria-label="按状态筛选"
            options={[
              { value: 'all', label: '全部', count: counts.all },
              { value: 'running', label: '运行中', count: counts.running },
              { value: 'ended', label: '已结束', count: counts.ended },
              ...(counts.lost ? [{ value: 'lost' as const, label: '已失联', count: counts.lost }] : []),
            ]}
          />
          <Input
            wrapperClassName="ml-auto w-full sm:w-60"
            value={query}
            onChange={(event) => setParam('q', event.target.value)}
            placeholder="搜索命令、主机或任务 ID"
            aria-label="搜索命令、主机或任务 ID"
            spellCheck={false}
            prefix={<MagnifyingGlass />}
            suffix={
              query ? (
                <button type="button" aria-label="清空搜索" onClick={() => setParam('q', null)} className="text-ink-3 hover:text-ink">
                  <X size={13} />
                </button>
              ) : undefined
            }
          />
        </motion.div>
      )}

      {jobs.isError ? (
        <Card>
          <EmptyState
            icon={<WarningCircle />}
            title="任务列表加载失败"
            description={(jobs.error as Error).message}
            action={<Button onClick={() => void refresh()}>重试</Button>}
          />
        </Card>
      ) : jobs.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[150px] rounded-card" />
          ))}
        </div>
      ) : isEmpty ? (
        <Card>
          <EmptyState
            icon={<Broadcast />}
            title="还没有后台任务"
            description="Agent 用 job_start 启动的长任务会出现在这里：实时日志、耗时与退出码，必要时可以终止。"
            action={<Button onClick={() => navigate('/activity')}>查看活动记录</Button>}
          />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MagnifyingGlass />}
            title="没有匹配的任务"
            description="换个关键词，或放宽状态筛选。"
            action={
              <Button
                onClick={() => {
                  const next = new URLSearchParams(search)
                  next.delete('q')
                  next.delete('status')
                  setSearch(next, { replace: true })
                }}
              >
                清除筛选
              </Button>
            }
          />
        </Card>
      ) : (
        <motion.div className="flex flex-col gap-3" variants={staggerContainer} initial="hidden" animate="visible">
          {list.map((item) => (
            <JobCard
              key={item.job.id}
              item={item}
              host={hostName.get(item.job.host_id)}
              run={runByJob.get(item.job.id)}
              now={now}
              selected={selected.has(item.job.id)}
              onSelect={(checked) =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (checked) next.add(item.job.id)
                  else next.delete(item.job.id)
                  return next
                })
              }
              onOpenLogs={() => setParam('job', item.job.id)}
              onKill={() => setConfirmJobId(item.job.id)}
            />
          ))}
        </motion.div>
      )}

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button
          type="button"
          onClick={() => setBatchConfirm(true)}
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors hover:bg-white/10"
        >
          <Stop size={13} />
          终止
        </button>
      </SelectionBar>

      <JobLogsSheet
        open={jobParam != null}
        job={sheetJob}
        host={sheetJob ? hostName.get(sheetJob.job.host_id) : undefined}
        run={sheetId ? runByJob.get(sheetId) : undefined}
        now={now}
        onClose={() => setParam('job', null)}
        onKill={() => sheetId && setConfirmJobId(sheetId)}
      />

      <ConfirmDialog
        open={confirmJobId !== null}
        onOpenChange={(open) => !open && setConfirmJobId(null)}
        danger
        icon={<Stop weight="bold" />}
        title="终止这个任务？"
        description="远程进程组会收到终止信号，已产生的日志会保留，未落盘的输出可能丢失。"
        confirmText="终止"
        onConfirm={async () => {
          if (confirmJobId !== null) await killJob.mutateAsync(confirmJobId)
        }}
      />

      <ConfirmDialog
        open={batchConfirm}
        onOpenChange={setBatchConfirm}
        danger
        icon={<Stop weight="bold" />}
        title={`终止 ${selected.size} 个任务？`}
        description="这些远程进程组会收到终止信号，已产生的日志会保留，未落盘的输出可能丢失。"
        confirmText="全部终止"
        onConfirm={async () => {
          // 失败的留在选中态，方便对照着重试
          const { failedIds } = await killJobs.mutateAsync([...selected])
          setSelected(new Set(failedIds))
        }}
      />
    </PageTransition>
  )
}

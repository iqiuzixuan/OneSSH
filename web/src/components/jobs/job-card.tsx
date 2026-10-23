import { Clock, FileText, Folder, HardDrives, Stop, Ticket, Timer } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { api } from '@/api/client'
import type { CommandOutputChunk, CommandRun, JobStatus } from '@/api/types'
import { Pill, type Tone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, Well } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { CopyButton } from '@/components/ui/code'
import { cn } from '@/lib/cn'
import { formatAgo, formatBytes, formatDuration } from '@/lib/format'
import { spring, staggerItem } from '@/lib/motion'

const TAIL_BYTES = 3072

/**
 * 任务状态。后端只产出 running / exited / killed / lost；exited 时有退出码。
 * 运行中、失败、失联用琥珀，正常完成用绿，被终止保持中性。
 */
export function jobStatusMeta(job: JobStatus['job']): { label: string; tone: Tone; live?: boolean } {
  switch (job.status) {
    case 'running':
      return { label: '运行中', tone: 'warn', live: true }
    case 'exited':
      if (job.exit_code == null) return { label: '已退出', tone: 'neutral' }
      return job.exit_code === 0 ? { label: '已完成', tone: 'ok' } : { label: `失败 · 退出码 ${job.exit_code}`, tone: 'warn' }
    case 'killed':
      return { label: '已终止', tone: 'neutral' }
    case 'lost':
      return { label: '已失联', tone: 'warn' }
    default:
      return { label: job.status, tone: 'neutral' }
  }
}

/** 任务耗时（毫秒）：注意任务的时间戳是「秒」 */
export function jobDuration(job: JobStatus['job'], now: number) {
  const end = job.finished_at != null ? job.finished_at * 1000 : job.status === 'running' ? now : null
  return end == null ? null : Math.max(0, end - job.started_at * 1000)
}

/**
 * 日志尾巴：只读最后 3 KB，按日志字节数做键——任务列表每次轮询带回新的 log_bytes 时才重拉，
 * 不额外轮询；切换期间沿用上一段，避免卡片闪空。
 */
function useJobTail(id: string, logBytes: number) {
  const offset = Math.max(0, logBytes - TAIL_BYTES)
  return useQuery({
    queryKey: ['jobs', id, 'tail', logBytes],
    enabled: logBytes > 0,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const chunk = await api<CommandOutputChunk>(`/jobs/${id}/logs?offset_bytes=${offset}&limit_bytes=${TAIL_BYTES}`)
      const lines = chunk.content.split('\n')
      // 从中间截断时第一行是半截，丢掉；末尾的空行也不要
      if (chunk.offset_bytes > 0) lines.shift()
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
      return lines.slice(-3)
    },
  })
}

export function JobCard({
  item,
  host,
  run,
  now,
  selected,
  onSelect,
  onOpenLogs,
  onKill,
}: {
  item: JobStatus
  host?: string
  /** 启动这个任务的那次 job_start 命令运行：带出令牌，并能跳到调用记录 */
  run?: CommandRun
  now: number
  selected: boolean
  onSelect: (checked: boolean) => void
  onOpenLogs: () => void
  onKill: () => void
}) {
  const { job } = item
  const running = job.status === 'running'
  const meta = jobStatusMeta(job)
  const tail = useJobTail(job.id, item.log_bytes)
  const lines = tail.data ?? []
  const duration = jobDuration(job, now)
  const failed = meta.tone === 'warn' && !running

  return (
    <motion.div variants={staggerItem} layout="position" transition={spring.soft}>
      <Card className={cn('p-1.5 transition-shadow duration-200', selected && 'shadow-[0_0_0_1.5px_var(--ink-3),var(--sh-card)]')}>
        <div className="flex items-center gap-3 px-2.5 pt-2.5 pb-3">
          {running && (
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelect(checked === true)}
              aria-label={`选择任务 ${job.id.slice(0, 8)}`}
            />
          )}
          <Pill tone={meta.tone} dot live={meta.live}>
            {meta.label}
          </Pill>
          <button
            type="button"
            onClick={onOpenLogs}
            className="min-w-0 flex-1 truncate text-left font-mono text-[13px] font-medium hover:underline"
            title={job.command}
          >
            {job.command}
          </button>
          <Button size="sm" variant="ghost" onClick={onOpenLogs}>
            <FileText />
            完整日志
          </Button>
          {running && (
            <Button size="sm" variant="danger" onClick={onKill}>
              <Stop />
              终止
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-2.5 pb-3 text-[12px] text-ink-2 [&_svg]:text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <HardDrives size={13} />
            {host ?? `主机 #${job.host_id}`}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 font-mono">
            <Folder size={13} />
            <span className="max-w-[220px] truncate">{job.cwd}</span>
          </span>
          {run?.token_name && (
            <span className="inline-flex items-center gap-1.5">
              <Ticket size={13} />
              {run.token_name}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} />
            {formatAgo(job.started_at * 1000, now)}开始
          </span>
          {duration != null && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Timer size={13} />
              {formatDuration(duration)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
            <FileText size={13} />
            {formatBytes(item.log_bytes)}
          </span>
          <span className="inline-flex items-center gap-0.5 font-mono text-ink-3">
            {job.id.slice(0, 8)}
            <CopyButton value={job.id} label="复制任务 ID" className="size-5" />
          </span>
        </div>

        {running && (
          // 远端进程不报告进度，这里是「仍在跑」的指示而不是百分比：一段琥珀光在轨道里往返
          <div className="relative mx-2.5 mb-3 h-[3px] overflow-hidden rounded-full bg-well-2" aria-hidden>
            <motion.span
              className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-warn"
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.8, ease: [0.45, 0, 0.25, 1], repeat: Infinity }}
            />
          </div>
        )}

        <Well className="overflow-hidden px-3 py-2.5 font-mono text-[11.5px] leading-[1.7] whitespace-pre">
          {item.log_bytes === 0 ? (
            <span className="text-ink-3">（暂无输出）</span>
          ) : lines.length === 0 ? (
            <span className="text-ink-3">{tail.isLoading ? '正在读取日志…' : '（日志末尾为空）'}</span>
          ) : (
            lines.map((line, index) => {
              const last = index === lines.length - 1
              const cls = cn('truncate', last ? (failed ? 'text-warn' : 'text-ink') : 'text-ink-2')
              // 只有最新一行在日志增长时上浮淡入，其余行原地不动
              return last ? (
                <motion.div
                  key={`last:${item.log_bytes}`}
                  className={cls}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring.snap}
                >
                  {line || ' '}
                </motion.div>
              ) : (
                <div key={index} className={cls}>
                  {line || ' '}
                </div>
              )
            })
          )}
        </Well>
      </Card>
    </motion.div>
  )
}

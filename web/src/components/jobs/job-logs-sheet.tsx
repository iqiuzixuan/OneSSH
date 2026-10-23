import { ArrowDown, ArrowSquareOut, Copy, Stop, WarningCircle } from '@phosphor-icons/react'
import { useLayoutEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJobLogs } from '@/api/queries'
import type { CommandRun, JobStatus } from '@/api/types'
import { Pill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton, useCopy } from '@/components/ui/code'
import { EmptyState } from '@/components/ui/empty-state'
import { KeyValues, Sheet, SheetSection } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { formatBytes, formatDuration } from '@/lib/format'
import { jobDuration, jobStatusMeta } from './job-card'

const fullTime = (sec: number) => new Date(sec * 1000).toLocaleString('zh-CN', { hour12: false })

/** 合并日志：从头分页读，「继续读取」拉下一段；运行中每 2 秒刷新，停在底部时跟随滚动 */
function JobLog({ job }: { job: JobStatus }) {
  const running = job.job.status === 'running'
  const logs = useJobLogs(job.job.id, running)
  const content = logs.data?.pages.map((page) => page.content).join('') ?? ''
  const total = logs.data?.pages[0]?.total_bytes ?? job.log_bytes
  const pre = useRef<HTMLPreElement>(null)
  const stick = useRef(true)

  useLayoutEffect(() => {
    const el = pre.current
    if (el && running && stick.current) el.scrollTop = el.scrollHeight
  }, [content, running])

  if (logs.isError && !content) {
    return <EmptyState icon={<WarningCircle />} title="日志读取失败" description={(logs.error as Error).message} />
  }
  return (
    <div>
      <div className="relative rounded-well bg-surface shadow-card">
        <pre
          ref={pre}
          onScroll={(event) => {
            const el = event.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className="m-0 max-h-[52dvh] min-h-40 overflow-auto py-3 pr-11 pl-3.5 font-mono text-[12px] leading-[1.7] break-words whitespace-pre-wrap text-ink"
        >
          {content || <span className="text-ink-3">{logs.isLoading ? '正在读取…' : '（暂无输出）'}</span>}
        </pre>
        {content && <CopyButton value={content} label="复制日志" message="日志已复制" className="absolute top-2 right-2" />}
      </div>
      <div className="flex items-center gap-2 px-0.5 pt-2 text-[11.5px] text-ink-3">
        {logs.isFetching && <Spinner className="size-3" />}
        <span>
          共 {formatBytes(total)}
          {running ? ' · 实时追加中' : logs.hasNextPage ? ' · 已读取前一部分' : ''}
        </span>
        {logs.hasNextPage && (
          <Button size="sm" variant="ghost" className="ml-auto" loading={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>
            <ArrowDown />
            继续读取
          </Button>
        )}
      </div>
    </div>
  )
}

export function JobLogsSheet({
  open,
  job,
  host,
  run,
  now,
  onClose,
  onKill,
}: {
  open: boolean
  /** 列表可能已刷新掉这条任务：日志按 job_id 拉取，与它是否还在列表里无关 */
  job: JobStatus | null
  host?: string
  run?: CommandRun
  now: number
  onClose: () => void
  onKill: () => void
}) {
  const navigate = useNavigate()
  const { copy } = useCopy()
  const meta = job ? jobStatusMeta(job.job) : null
  const duration = job ? jobDuration(job.job, now) : null

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      width={640}
      title={
        job ? (
          <span className="font-mono text-[14.5px] font-medium tracking-normal" title={job.job.command}>
            {job.job.command || job.job.id}
          </span>
        ) : (
          '任务日志'
        )
      }
      status={
        meta ? (
          <Pill tone={meta.tone} dot live={meta.live} className="shrink-0">
            {meta.label}
          </Pill>
        ) : undefined
      }
      meta={job ? `${host ?? `主机 #${job.job.host_id}`} · ${job.job.cwd}` : undefined}
      actions={
        job ? (
          <>
            <Button size="sm" onClick={() => void copy(job.job.command, '命令已复制')}>
              <Copy />
              复制命令
            </Button>
            {run && (
              <Button size="sm" onClick={() => navigate(`/activity/${run.id}`)}>
                <ArrowSquareOut />
                调用记录
              </Button>
            )}
            {job.job.status === 'running' && (
              <Button size="sm" variant="danger" className="ml-auto" onClick={onKill}>
                <Stop />
                终止
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {job && (
        <>
          <SheetSection title="合并日志" sub="stdout 与 stderr 按到达顺序合并">
            <JobLog job={job} />
          </SheetSection>
          <SheetSection title="任务信息">
            <KeyValues
              items={[
                {
                  label: '任务 ID',
                  value: (
                    <span className="inline-flex max-w-full items-center gap-1">
                      <span className="truncate">{job.job.id}</span>
                      <CopyButton value={job.job.id} label="复制任务 ID" className="size-6" />
                    </span>
                  ),
                  mono: true,
                },
                { label: '主机', value: host ?? `#${job.job.host_id}`, mono: true },
                { label: '工作目录', value: job.job.cwd, mono: true },
                ...(run?.token_name ? [{ label: '令牌', value: run.token_name }] : []),
                ...(job.job.started_at ? [{ label: '开始', value: fullTime(job.job.started_at) }] : []),
                ...(job.job.finished_at ? [{ label: '结束', value: fullTime(job.job.finished_at) }] : []),
                ...(duration != null ? [{ label: '耗时', value: formatDuration(duration), mono: true }] : []),
                ...(job.job.exit_code != null ? [{ label: '退出码', value: String(job.job.exit_code), mono: true }] : []),
              ]}
            />
          </SheetSection>
        </>
      )}
    </Sheet>
  )
}

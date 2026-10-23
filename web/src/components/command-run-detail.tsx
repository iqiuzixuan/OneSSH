import { ArrowDown, Broadcast, Copy, Stop, TerminalWindow, Timer, WarningCircle } from '@phosphor-icons/react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useLiveListener, type StreamEventItem } from '@/api/live'
import { queryKeys, useCommandOutput, useCommandRun, useKillJob } from '@/api/queries'
import type { Audit, CommandRun, CommandRunStatus } from '@/api/types'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Chip, Dot, Pill, Tag, type Tone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton, useCopy } from '@/components/ui/code'
import { EmptyState } from '@/components/ui/empty-state'
import { Segmented } from '@/components/ui/segmented'
import { KeyValues, Sheet, SheetSection } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { auditParamEntries, formatAuditParam } from '@/lib/audit'
import { cn } from '@/lib/cn'
import { formatAgo, formatBytes, formatClock, formatDuration } from '@/lib/format'
import { spring, staggerContainer, staggerItem } from '@/lib/motion'

/** 命令运行的六种状态：运行中 / 失败 / 超时 / 失联是琥珀，成功是绿，取消保持中性 */
export const RUN_STATUS: Record<CommandRunStatus, { label: string; tone: Tone }> = {
  running: { label: '运行中', tone: 'warn' },
  succeeded: { label: '成功', tone: 'ok' },
  failed: { label: '失败', tone: 'warn' },
  timeout: { label: '已超时', tone: 'warn' },
  cancelled: { label: '已取消', tone: 'neutral' },
  lost: { label: '已失联', tone: 'warn' },
}

export function RunStatusPill({ run, className }: { run: Pick<CommandRun, 'status' | 'exit_code'>; className?: string }) {
  const meta = RUN_STATUS[run.status] ?? { label: run.status, tone: 'neutral' as Tone }
  return (
    <Pill tone={meta.tone} dot live={run.status === 'running'} className={className}>
      {meta.label}
      {run.exit_code != null && run.status !== 'succeeded' ? ` · 退出码 ${run.exit_code}` : ''}
    </Pill>
  )
}

/** 每秒推进的「现在」，只在需要时（运行中）才启动定时器 */
function useTicker(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

/** 参数清单：键是等宽灰字，值原样保留换行；嵌套对象格式化成 JSON */
export function ParamsList({ entries, className }: { entries: [string, unknown][]; className?: string }) {
  return (
    <dl className={cn('overflow-hidden rounded-well bg-surface shadow-card', className)}>
      {entries.map(([key, value], index) => (
        <div
          key={key}
          className={cn('grid gap-1 px-3 py-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3', index > 0 && 'border-t border-line')}
        >
          <dt className="font-mono text-[12px] text-ink-3">{key}</dt>
          <dd className="m-0 font-mono text-[12px] leading-[1.6] break-words whitespace-pre-wrap text-ink">
            {formatAuditParam(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * 一路输出：分页从 0 读到尾，「继续读取」拉下一段；运行中每 2 秒刷新，
 * 实时事件到达时立即失效重拉（见 CommandRunDetail）。停在底部时跟随新输出滚动。
 */
function OutputPane({
  run,
  stream,
  fallback,
}: {
  run: CommandRun
  stream: 'stdout' | 'stderr' | 'combined'
  fallback?: string
}) {
  const running = run.status === 'running'
  const enabled = !run.output_expired && (run.output_available || running)
  const output = useCommandOutput(run.id, stream, enabled, running)
  const content = output.data?.pages.map((page) => page.content).join('') ?? (enabled ? '' : (fallback ?? ''))
  const total = output.data?.pages[0]?.total_bytes
  const pre = useRef<HTMLPreElement>(null)
  const stick = useRef(true)

  useLayoutEffect(() => {
    const el = pre.current
    if (el && running && stick.current) el.scrollTop = el.scrollHeight
  }, [content, running])

  if (run.output_expired) {
    return (
      <p className="rounded-well bg-surface px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2 shadow-card">
        输出已超过 7 天保留期被清理；命令、状态与退出码仍会保留。
      </p>
    )
  }
  if (output.isError && !content) {
    return (
      <div className="flex items-start gap-2 rounded-well bg-surface px-3.5 py-3 text-[12.5px] text-ink-2 shadow-card">
        <WarningCircle className="mt-px shrink-0 text-warn" size={15} />
        {running ? '等待第一段输出…' : (output.error as Error).message || '输出暂时无法读取'}
      </div>
    )
  }
  const bad = stream === 'stderr' && !!content
  return (
    <div>
      <div className="relative rounded-well bg-surface shadow-card">
        <pre
          ref={pre}
          onScroll={(event) => {
            const el = event.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className={cn(
            'm-0 max-h-[340px] min-h-12 overflow-auto py-3 pr-11 pl-3.5 font-mono text-[12px] leading-[1.7] break-words whitespace-pre-wrap',
            bad ? 'text-bad' : 'text-ink',
          )}
        >
          {content ||
            (output.isLoading ? (
              <span className="text-ink-3">正在读取…</span>
            ) : (
              <span className="text-ink-3">（{stream === 'combined' ? '日志' : stream} 为空）</span>
            ))}
        </pre>
        {content && <CopyButton value={content} label="复制输出" message="输出已复制" className="absolute top-2 right-2" />}
      </div>
      <div className="flex items-center gap-2 px-0.5 pt-2 text-[11.5px] leading-relaxed text-ink-3">
        {output.isFetching && <Spinner className="size-3" />}
        <span>
          {running
            ? '输出实时追加中…'
            : total != null
              ? `共 ${formatBytes(total)}${output.hasNextPage ? '，已读取前一部分' : ''}`
              : !enabled && fallback
                ? '完整输出未落盘，这里是执行结束时保存的预览片段。'
                : ''}
        </span>
        {output.hasNextPage && (
          <Button size="sm" variant="ghost" className="ml-auto" loading={output.isFetchingNextPage} onClick={() => void output.fetchNextPage()}>
            <ArrowDown />
            继续读取
          </Button>
        )}
      </div>
    </div>
  )
}

/** exec_many 的一次调用对应多台主机各一条运行记录：用芯片在它们之间切换 */
function SiblingRuns({ ids, active, onSwitch }: { ids: string[]; active: string; onSwitch: (id: string) => void }) {
  const runs = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.commandRun(id),
      queryFn: () => api<CommandRun>(`/command-runs/${id}`),
      staleTime: 10_000,
    })),
  })
  return (
    <SheetSection title={`批量执行 · ${ids.length} 台主机`}>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id, index) => {
          const run = runs[index]?.data
          const tone = run ? RUN_STATUS[run.status]?.tone : 'neutral'
          return (
            <Chip key={id} mono active={id === active} onClick={() => onSwitch(id)} className="h-6 px-2.5">
              <Dot tone={tone ?? 'neutral'} live={run?.status === 'running'} className="size-1.5" />
              {run?.host ?? id.slice(0, 8)}
            </Chip>
          )
        })}
      </div>
    </SheetSection>
  )
}

/**
 * 命令运行详情的主体（不含 Sheet 外壳）：结果摘要、运行信息、输出、调用参数。
 * 运行中时订阅实时事件：本次运行的 command_output / command_finished 一到就节流失效重拉。
 */
export function CommandRunDetail({ run, audit }: { run: CommandRun; audit?: Audit | null }) {
  const qc = useQueryClient()
  const running = run.status === 'running'
  const now = useTicker(running)
  const throttle = useRef<number | undefined>(undefined)

  useLiveListener(
    useCallback(
      (event: StreamEventItem) => {
        if (event.type !== 'command_output' && event.type !== 'command_finished') return
        if ((event.data as { run_id?: string } | null)?.run_id !== run.id) return
        if (throttle.current) return
        throttle.current = window.setTimeout(() => {
          throttle.current = undefined
          void qc.invalidateQueries({ queryKey: ['command-runs', 'output', run.id] })
          void qc.invalidateQueries({ queryKey: queryKeys.commandRun(run.id) })
        }, 400)
      },
      [qc, run.id],
    ),
  )
  useEffect(() => () => window.clearTimeout(throttle.current), [])

  const defaultTab = run.stdout_bytes > 0 || run.stderr_bytes === 0 ? 'stdout' : 'stderr'
  const [tab, setTab] = useState<'stdout' | 'stderr'>(defaultTab)
  // 切换到另一条运行（exec_many 的兄弟主机）时回到它自己的默认输出流
  const [tabFor, setTabFor] = useState(run.id)
  if (tabFor !== run.id) {
    setTabFor(run.id)
    setTab(defaultTab)
  }

  const duration = running ? now - run.started_at : run.duration_ms
  // 与运行信息同义的参数（host / cwd / command）不再重复列出
  const params = audit
    ? auditParamEntries(audit).filter(
        ([key, value]) => !((key === 'host' || key === 'cwd') && typeof value === 'string' && value === run[key]),
      )
    : []
  const exitTone = run.exit_code == null ? 'text-ink-3' : run.exit_code === 0 ? 'text-ink' : 'text-warn'

  return (
    <motion.div className="flex flex-col gap-2" variants={staggerContainer} initial="hidden" animate="visible">
      {run.error && (
        <motion.div variants={staggerItem}>
          <div
            className={cn(
              'flex gap-2.5 rounded-sheet-in px-3.5 py-3 font-mono text-[12px] leading-relaxed',
              run.status === 'timeout' ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad',
            )}
          >
            {run.status === 'timeout' ? <Timer size={16} className="shrink-0" /> : <WarningCircle size={16} className="shrink-0" />}
            <div className="min-w-0 break-words">
              {run.error}
              {run.status === 'timeout' && (
                <p className="mt-1 font-sans text-[12.5px] text-ink-2">超过 10 分钟的命令请改用 job_start 在后台运行。</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
      {run.output_error && (
        <motion.div variants={staggerItem}>
          <p className="rounded-sheet-in bg-warn-soft px-3.5 py-3 text-[12.5px] text-warn">完整输出记录失败：{run.output_error}</p>
        </motion.div>
      )}

      <motion.div variants={staggerItem}>
        <SheetSection bodyClassName="pt-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[11.5px] text-ink-3">退出码</div>
              <div className={cn('mt-1 font-mono text-[26px] leading-none font-medium tracking-[-0.02em]', exitTone)}>
                {running ? <Dot tone="warn" live label="运行中" className="ml-1" /> : (run.exit_code ?? '—')}
              </div>
            </div>
            <div>
              <div className="text-[11.5px] text-ink-3">耗时</div>
              <div className="mt-1.5 font-mono text-[15px] font-medium tabular-nums">{formatDuration(Math.max(0, duration))}</div>
            </div>
            <div>
              <div className="text-[11.5px] text-ink-3">输出</div>
              <div className="mt-1.5 font-mono text-[15px] font-medium tabular-nums">
                {formatBytes(run.stdout_bytes + run.stderr_bytes)}
              </div>
            </div>
          </div>
        </SheetSection>
      </motion.div>

      <motion.div variants={staggerItem}>
        <SheetSection title="运行信息">
          <KeyValues
            items={[
              { label: '令牌', value: run.token_name ?? <span className="text-ink-3">系统</span> },
              { label: '主机', value: run.host, mono: true },
              { label: '工具', value: run.tool, mono: true },
              { label: '工作目录', value: run.cwd, mono: true },
              { label: '会话', value: run.session ?? <span className="text-ink-3">无（一次性）</span>, mono: !!run.session },
              { label: '开始', value: `${formatClock(run.started_at)} · ${formatAgo(run.started_at, now)}` },
              ...(run.finished_at ? [{ label: '结束', value: formatClock(run.finished_at) }] : []),
              ...(run.job_id ? [{ label: '后台任务', value: run.job_id, mono: true }] : []),
              {
                label: '运行 ID',
                value: (
                  <span className="inline-flex max-w-full items-center gap-1">
                    <span className="truncate">{run.id}</span>
                    <CopyButton value={run.id} label="复制运行 ID" className="size-6" />
                  </span>
                ),
                mono: true,
              },
            ]}
          />
        </SheetSection>
      </motion.div>

      <motion.div variants={staggerItem}>
        <SheetSection
          title="输出"
          actions={
            run.job_id ? (
              <Tag>combined</Tag>
            ) : (
              <Segmented
                size="sm"
                value={tab}
                onChange={setTab}
                aria-label="输出流"
                options={(['stdout', 'stderr'] as const).map((value) => ({
                  value,
                  label: (
                    <>
                      {value}
                      <span className="font-mono text-[11px] text-ink-3">
                        {formatBytes(value === 'stdout' ? run.stdout_bytes : run.stderr_bytes)}
                      </span>
                    </>
                  ),
                }))}
              />
            )
          }
          bodyClassName="pt-2"
        >
          {run.job_id ? (
            <OutputPane run={run} stream="combined" />
          ) : (
            <motion.div key={tab} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <OutputPane
                run={run}
                stream={tab}
                fallback={tab === 'stdout' ? run.stdout_preview : run.stderr_preview}
              />
            </motion.div>
          )}
        </SheetSection>
      </motion.div>

      {params.length > 0 && (
        <motion.div variants={staggerItem}>
          <SheetSection title="调用参数" sub={audit ? `审计 #${audit.ID}` : undefined}>
            <ParamsList entries={params} />
          </SheetSection>
        </motion.div>
      )}
    </motion.div>
  )
}

/**
 * 命令运行详情面板：由路由 /activity/:runId 驱动。
 * audit 存在时（从活动流点进来会带 ?audit=ID）额外展示调用参数，exec_many 还能在多台主机的运行间切换。
 */
export function CommandRunSheet({
  runId,
  audit,
  open,
  onClose,
  onSwitchRun,
}: {
  runId: string | null
  audit?: Audit | null
  open: boolean
  onClose: () => void
  onSwitchRun: (id: string) => void
}) {
  const navigate = useNavigate()
  const detail = useCommandRun(runId)
  const killJob = useKillJob()
  const { copy } = useCopy()
  const [confirmKill, setConfirmKill] = useState(false)
  const run = detail.data
  const siblings = audit?.RunIDs && audit.RunIDs.length > 1 && runId && audit.RunIDs.includes(runId) ? audit.RunIDs : null

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => !next && onClose()}
        width={600}
        title={
          run ? (
            <span className="font-mono text-[14.5px] font-medium tracking-normal" title={run.command}>
              {run.command}
            </span>
          ) : (
            '命令运行'
          )
        }
        status={run ? <RunStatusPill run={run} className="shrink-0" /> : undefined}
        meta={
          run ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Tag>{run.tool}</Tag>
              <span className="text-ink-3">#{run.seq}</span>
              <span>
                {run.token_name ?? '系统'} → {run.host}
              </span>
            </span>
          ) : undefined
        }
        actions={
          run ? (
            <>
              <Button size="sm" onClick={() => void copy(run.command, '命令已复制')}>
                <Copy />
                复制命令
              </Button>
              <Button size="sm" onClick={() => navigate(`/terminal?host=${encodeURIComponent(run.host)}`)}>
                <TerminalWindow />
                在终端中打开
              </Button>
              {run.job_id && (
                <Button size="sm" onClick={() => navigate(`/jobs?job=${encodeURIComponent(run.job_id!)}`)}>
                  <Broadcast />
                  查看任务
                </Button>
              )}
              {run.job_id && run.status === 'running' && (
                <Button size="sm" variant="danger" className="ml-auto" onClick={() => setConfirmKill(true)}>
                  <Stop />
                  终止
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {siblings && runId && <SiblingRuns ids={siblings} active={runId} onSwitch={onSwitchRun} />}
        {detail.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-[86px] rounded-sheet-in" />
            <Skeleton className="h-[220px] rounded-sheet-in" />
            <Skeleton className="h-[180px] rounded-sheet-in" />
          </div>
        ) : detail.isError || !run ? (
          <EmptyState
            icon={<WarningCircle />}
            title="找不到这次运行"
            description={(detail.error as Error | null)?.message ?? '记录不存在，或输出已超过保留期被清理。'}
          />
        ) : (
          <motion.div key={run.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
            <CommandRunDetail run={run} audit={audit} />
          </motion.div>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirmKill}
        onOpenChange={setConfirmKill}
        danger
        icon={<Stop weight="bold" />}
        title="终止这个后台任务？"
        description={
          run ? (
            <>
              网关会向 <code className="font-mono text-[12px]">{run.host}</code> 上的进程组发送终止信号，已产生的输出会保留。
            </>
          ) : undefined
        }
        confirmText="终止"
        onConfirm={async () => {
          if (run?.job_id) await killJob.mutateAsync(run.job_id)
        }}
      />
    </>
  )
}

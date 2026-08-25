import { CaretRight } from '@phosphor-icons/react'
import { Link, useNavigate } from 'react-router-dom'
import type { StreamEventItem, StreamStatus } from '@/hooks/use-event-stream'
import { Led } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatClock, formatDuration } from '@/lib/format'

type FeedRow = {
  id: number
  ts: number
  tag: string
  danger?: boolean
  host: string
  text: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** 工具名归并成大写类别短签：exec*→EXEC、file*→FILE、job*→JOB、memory*→MEMORY，其余原样大写 */
export function toolTag(tool: string): string {
  if (/^exec/.test(tool)) return 'EXEC'
  if (/^file|^sftp/.test(tool)) return 'FILE'
  if (/^job/.test(tool)) return 'JOB'
  if (/^memory/.test(tool)) return 'MEMORY'
  if (/grep|search|^find/.test(tool)) return 'GREP'
  return tool.toUpperCase().slice(0, 8)
}

/** demo 的 .tag：等宽大写小签，按类别着色（EXEC 主题色 / FILE·GREP 蓝 / JOB 紫 / DENY 红） */
export function EventTag({ tag, danger }: { tag: string; danger?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-1.5 py-px font-mono text-[9px] tracking-[0.08em]',
        danger || tag === 'DENY'
          ? 'border-danger bg-danger/10 text-danger'
          : tag === 'EXEC'
            ? 'border-accent text-accent-ink'
            : tag === 'FILE' || tag === 'GREP'
              ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : tag === 'JOB'
                ? 'border-violet-500 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                : 'border-border text-muted',
      )}
    >
      {tag}
    </span>
  )
}

/** 只保留三种言之有物的事件；command_output 这类逐块输出太碎，不进 feed */
function toRow(event: StreamEventItem): FeedRow | null {
  if (!isRecord(event.data)) return null
  const data = event.data
  const host = typeof data.host === 'string' ? data.host : ''

  if (event.type === 'tool_call') {
    const tool = typeof data.tool === 'string' ? data.tool : 'call'
    const ok = data.ok !== false
    const summary = typeof data.summary === 'string' && data.summary ? data.summary : tool
    const duration = typeof data.duration_ms === 'number' ? ` · ${formatDuration(data.duration_ms)}` : ''
    return {
      id: event.id,
      ts: event.ts,
      tag: ok ? toolTag(tool) : 'DENY',
      danger: !ok,
      host,
      text: `${summary}${duration}`,
    }
  }
  if (event.type === 'command_started') {
    const command = typeof data.command === 'string' ? data.command : ''
    if (!command) return null
    return { id: event.id, ts: event.ts, tag: 'EXEC', host, text: command }
  }
  if (event.type === 'command_finished') {
    const code = typeof data.exit_code === 'number' ? data.exit_code : null
    const ok = code === 0
    return {
      id: event.id,
      ts: event.ts,
      tag: 'EXIT',
      danger: !ok && code != null,
      host,
      text: code == null ? '执行结束' : `退出码 ${code}`,
    }
  }
  return null
}

export type LastCommand = {
  text: string
  running: boolean
  ok: boolean
  /** 完成态的退出码；running 或未知为 null */
  exitCode: number | null
  durationMs: number | null
}

/**
 * 主机卡的「最近一次调用」：取该主机最新的 tool_call / command_started。
 * command_started 是否仍在跑，用同 run_id 的 command_finished 是否已出现来判断。
 */
export function lastHostCommand(events: StreamEventItem[], hostName: string): LastCommand | null {
  const finished = new Set<string>()
  for (const event of events) {
    if (event.type === 'command_finished' && isRecord(event.data) && typeof event.data.run_id === 'string') {
      finished.add(event.data.run_id)
    }
  }
  for (const event of events) {
    if (!isRecord(event.data) || event.data.host !== hostName) continue
    if (event.type === 'tool_call') {
      const summary = typeof event.data.summary === 'string' ? event.data.summary : ''
      const tool = typeof event.data.tool === 'string' ? event.data.tool : ''
      return {
        text: summary || tool,
        running: false,
        ok: event.data.ok !== false,
        exitCode: null,
        durationMs: typeof event.data.duration_ms === 'number' ? event.data.duration_ms : null,
      }
    }
    if (event.type === 'command_started' && typeof event.data.command === 'string') {
      const runID = typeof event.data.run_id === 'string' ? event.data.run_id : ''
      return {
        text: event.data.command,
        running: runID !== '' && !finished.has(runID),
        ok: true,
        exitCode: null,
        durationMs: null,
      }
    }
  }
  return null
}

/**
 * 总览页右侧常驻的 Agent 实时事件流：时间 + 类型签 + 主机 + 单条摘要，
 * 点击任一记录跳到活动页看退出码与完整输出。
 */export function ActivityStream({
  events,
  status,
  className,
}: {
  events: StreamEventItem[]
  status: StreamStatus
  className?: string
}) {
  const navigate = useNavigate()
  const rows = events.map(toRow).filter((row) => row != null).slice(0, 30)
  const broken = status === 'error'

  return (
    <Card className={cn('flex max-h-[640px] flex-col p-4', className)}>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
        <Led tone={broken ? 'err' : 'on'} pulse={!broken} />
        Agent Stream
        <Link
          to="/activity"
          className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-normal tracking-normal text-accent-ink normal-case hover:underline"
        >
          全部活动
          <CaretRight size={11} />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="flex h-full min-h-32 items-center justify-center text-center text-[12px] text-balance text-muted">
            等待事件…工具调用与命令状态会在发生的瞬间推送到这里。
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => navigate('/activity')}
              className="flex w-full items-baseline gap-2 border-b border-surface-2 px-0.5 py-1.5 text-left transition-colors last:border-b-0 hover:bg-surface-2"
            >
              <time className="shrink-0 font-mono text-[10px] text-faint tabular-nums">
                {formatClock(row.ts)}
              </time>
              <EventTag tag={row.tag} danger={row.danger} />
              <span className="w-16 shrink-0 truncate text-[11px] text-muted" title={row.host}>
                {row.host || '—'}
              </span>
              <span className="truncate font-mono text-[11px] text-text" title={row.text}>
                {row.text}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="mt-2 border-t border-dashed border-border pt-2.5 text-[11px] text-muted">
        实时事件经 SSE 推送 · 点击记录查看退出码与输出
      </div>
    </Card>
  )
}

import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import { Dot, Tag, type Tone } from '@/components/ui/badge'
import type { CallItem, Outcome } from '@/lib/calls'
import { cn } from '@/lib/cn'
import { formatClock, formatDuration } from '@/lib/format'
import { spring } from '@/lib/motion'

export const OUTCOME_TONE: Record<Outcome, Tone> = { ok: 'ok', failed: 'warn', denied: 'bad' }
export const OUTCOME_LABEL: Record<Outcome, string> = { ok: '成功', failed: '失败', denied: '拒绝' }

/**
 * 记住首屏已经出现过的 key：首屏不播入场，之后新出现的 key 才算「新到」。
 * 实时列表因此只给真正的新事件做进场与高亮，切页回来也不会整列重放。
 */
export function useFreshKeys(keys: string[]) {
  // 记录每个 key 第一次出现的时间；首屏的记为 0。用时间窗而不是「本次渲染才出现」，
  // StrictMode 的双重渲染与紧随其后的重渲染里，新行仍能被认出来
  const seen = useRef<Map<string, number> | null>(null)
  const now = Date.now()
  if (seen.current == null) {
    seen.current = new Map(keys.map((key) => [key, 0]))
    return new Set<string>()
  }
  const fresh = new Set<string>()
  for (const key of keys) {
    const at = seen.current.get(key)
    if (at == null) seen.current.set(key, now)
    if (at == null || (at > 0 && now - at < 1300)) fresh.add(key)
  }
  return fresh
}

/**
 * 实时插入的行容器：新行从 0 高度长出来，同时最旧的一行收起，卡片总高度不抖；
 * 新行底下垫一层井色，0.9s 内褪去，让眼睛知道「刚来的是哪条」。
 */
export function LiveRows<T extends { key: string }>({
  items,
  rowHeight,
  render,
  className,
}: {
  items: T[]
  rowHeight: number
  render: (item: T) => React.ReactNode
  className?: string
}) {
  const fresh = useFreshKeys(items.map((item) => item.key))
  return (
    <div className={className}>
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.key}
            className="relative overflow-hidden rounded-well"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: rowHeight, opacity: 1, transition: spring.soft }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } }}
          >
            {fresh.has(item.key) && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-well-2"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.9, delay: 0.35, ease: 'easeOut' }}
              />
            )}
            <div className="relative h-full">{render(item)}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/**
 * 概览「实时动态」的一行：时间 · 结果点 · 类别 · 谁 → 哪台 + 摘要 · 耗时。
 * 失败的摘要用琥珀，拒绝的用红——行内只有这里会出现颜色。
 */
export function CallRow({ call, onClick }: { call: CallItem; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'grid h-full w-full grid-cols-[62px_10px_58px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-well px-2.5 text-left',
        'transition-colors duration-150 hover:bg-hover',
      )}
    >
      <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">{formatClock(call.ts)}</span>
      <Dot tone={OUTCOME_TONE[call.outcome]} label={OUTCOME_LABEL[call.outcome]} />
      <Tag tone={call.outcome === 'denied' ? 'bad' : 'neutral'} className="justify-self-start">
        {call.outcome === 'denied' ? 'DENY' : call.tag}
      </Tag>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-[12.5px] whitespace-nowrap text-ink-2">
          <b className="font-medium text-ink">{call.token ?? '—'}</b>
          {call.host && <> → {call.host}</>}
        </span>
        <span
          className={cn(
            'truncate font-mono text-[12px]',
            call.outcome === 'denied' ? 'text-bad' : call.outcome === 'failed' ? 'text-warn' : 'text-ink-2',
          )}
          title={call.summary}
        >
          {call.summary}
        </span>
      </span>
      <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">
        {call.outcome === 'denied' ? '—' : formatDuration(call.durationMs)}
      </span>
    </button>
  )
}

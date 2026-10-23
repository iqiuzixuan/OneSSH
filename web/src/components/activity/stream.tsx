import { CaretRight } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import { OUTCOME_LABEL, OUTCOME_TONE } from '@/components/call-row'
import { Dot, Tag } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import type { CallItem } from '@/lib/calls'
import { cn } from '@/lib/cn'
import { formatClock, formatDuration } from '@/lib/format'
import { spring } from '@/lib/motion'

/**
 * 列宽：时间 · 结果点 · 类别 · 令牌 · 主机 · 内容 · 耗时 · 箭头。
 * 窄屏收起令牌 / 主机 / 耗时，只留「什么时候、结果、做了什么」。
 */
const GRID =
  'grid items-center gap-2.5 px-3 grid-cols-[64px_14px_58px_minmax(0,1fr)_18px] ' +
  'md:grid-cols-[74px_14px_64px_120px_110px_minmax(0,1fr)_68px_18px] xl:grid-cols-[74px_14px_64px_136px_132px_minmax(0,1fr)_76px_18px]'

export const ROW_HEIGHT = 42

/** 表头：类别与主机两列带列头漏斗（精确工具名 / 主机多选），窄屏整行隐藏 */
export function StreamHeader({
  categoryFilter,
  hostFilter,
}: {
  categoryFilter?: React.ReactNode
  hostFilter?: React.ReactNode
}) {
  return (
    <div className={cn(GRID, 'hidden h-[38px] text-[12px] text-ink-3 md:grid')}>
      <span>时间</span>
      <span />
      <span className="inline-flex items-center gap-1">类别{categoryFilter}</span>
      <span>令牌</span>
      <span className="inline-flex items-center gap-1">主机{hostFilter}</span>
      <span>内容</span>
      <span className="text-right">耗时</span>
      <span />
    </div>
  )
}

/** 一条调用：拒绝的摘要红、失败的琥珀；能展开的行（有命令运行或审计 id）悬停时露出箭头 */
export function StreamRow({ call, onOpen }: { call: CallItem; onOpen?: () => void }) {
  const clickable = !!onOpen
  const tag = call.outcome === 'denied' ? 'DENY' : call.tag
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!clickable || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        onOpen?.()
      }}
      className={cn(
        GRID,
        'group/srow h-full rounded-well transition-colors duration-150 outline-none',
        clickable && 'cursor-pointer hover:bg-hover focus-visible:bg-hover',
      )}
    >
      <span className="font-mono text-[12px] text-ink-3 tabular-nums">{formatClock(call.ts)}</span>
      <Tooltip content={OUTCOME_LABEL[call.outcome]}>
        <span className="grid place-items-center">
          <Dot tone={OUTCOME_TONE[call.outcome]} label={OUTCOME_LABEL[call.outcome]} />
        </span>
      </Tooltip>
      <span>
        <Tag tone={call.outcome === 'denied' ? 'bad' : 'neutral'} title={call.tool}>
          {tag}
        </Tag>
      </span>
      <span className="hidden truncate text-[12.5px] md:block" title={call.token}>
        {call.token ?? <span className="text-ink-3">系统</span>}
      </span>
      <span className="hidden truncate font-mono text-[12px] text-ink-2 md:block" title={call.host}>
        {call.host || '—'}
      </span>
      <span
        className={cn(
          'truncate font-mono text-[12px]',
          call.outcome === 'denied' ? 'text-bad' : call.outcome === 'failed' ? 'text-warn' : 'text-ink',
        )}
        title={call.summary}
      >
        {call.summary}
        {call.outcome === 'failed' && call.exitCode != null && (
          <span className="ml-2 text-ink-3">退出码 {call.exitCode}</span>
        )}
      </span>
      <span className="hidden text-right font-mono text-[12px] text-ink-3 tabular-nums md:block">
        {call.outcome === 'denied' ? '—' : formatDuration(call.durationMs)}
      </span>
      <CaretRight
        size={13}
        className={cn(
          'text-ink-3 opacity-0 transition-[opacity,transform] duration-200',
          clickable && 'group-hover/srow:translate-x-0.5 group-hover/srow:opacity-100 group-focus-visible/srow:opacity-100',
        )}
      />
    </div>
  )
}

/**
 * 实时插入的行容器。与概览的 LiveRows 不同：这里还会在底部追加「更早的记录」，
 * 所以只有「比已见过的最新一条还新」的行才算新到——它们从 0 高度长出来并短暂垫一层井色；
 * 翻页追加的旧记录直接出现，不闪也不长高，免得被误认为刚发生。
 */
export function StreamRows({
  items,
  render,
}: {
  items: CallItem[]
  render: (item: CallItem) => React.ReactNode
}) {
  const seen = useRef<{ keys: Map<string, number>; newest: number } | null>(null)
  const now = Date.now()
  if (seen.current == null) {
    seen.current = { keys: new Map(items.map((item) => [item.key, 0])), newest: items[0]?.ts ?? 0 }
  }
  const state = seen.current
  const fresh = new Set<string>()
  for (const item of items) {
    let at = state.keys.get(item.key)
    if (at == null) {
      // 比已见过的最新一条还新才算「新到」；翻页追加的旧记录记为 0
      at = item.ts >= state.newest ? now : 0
      state.keys.set(item.key, at)
    }
    if (at > 0 && now - at < 1300) fresh.add(item.key)
  }
  if (items[0] && items[0].ts > state.newest) state.newest = items[0].ts

  return (
    <div className="[&>div+div]:shadow-[0_-1px_0_var(--line)] [&>div:hover]:shadow-none [&>div:hover+div]:shadow-none">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const isFresh = fresh.has(item.key)
          return (
            <motion.div
              key={item.key}
              className="relative overflow-hidden rounded-well"
              initial={isFresh ? { height: 0, opacity: 0 } : false}
              animate={{ height: ROW_HEIGHT, opacity: 1, transition: spring.soft }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } }}
            >
              {isFresh && (
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
          )
        })}
      </AnimatePresence>
    </div>
  )
}

import { animate, useMotionValue, useReducedMotion, useTransform, motion } from 'motion/react'
import { useEffect } from 'react'
import { cn } from '@/lib/cn'
import { Card } from './card'
import { COUNT_DURATION } from '@/lib/motion'

/**
 * 每项统计一张独立胶囊卡，右上角叠一层 accent 辐射光晕，
 * 让数据带在雾白底上有主次，而不是一条灰线分三栏。
 */
export function StatGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('grid grid-cols-3 gap-3.5', className)}>{children}</div>
}

export function StatCard({
  title,
  value,
  suffix,
  sub,
}: {
  title: string
  value: number
  suffix?: string
  /** 数值下方的一行补充说明，如「全部可达」 */
  sub?: string
}) {
  const reduced = useReducedMotion()
  const count = useMotionValue(reduced ? value : 0)
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString())

  useEffect(() => {
    // 后台标签页里 rAF 不推进，动画会把数字永远钉在 0——这种情况直接落终值
    if (reduced || document.hidden) {
      count.set(value)
      return
    }
    const controls = animate(count, value, { duration: COUNT_DURATION, ease: 'easeOut' })
    return () => controls.stop()
  }, [value, reduced, count])

  return (
    <Card className="relative overflow-hidden">
      {/* 光晕只作氛围，不抢数值：pointer-events 穿透，窄屏也不参与布局 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(140px_70px_at_85%_0%,var(--accent-soft),transparent_70%)]"
      />
      <div className="relative min-w-0 px-4.5 py-4">
        <p className="truncate text-[10.5px] font-medium tracking-[0.1em] text-faint uppercase">
          {title}
        </p>
        <p className="mt-1.5 flex items-baseline gap-1">
          <motion.span className="text-[26px] leading-none font-bold tracking-tight text-text tabular-nums">
            {rounded}
          </motion.span>
          {suffix && <span className="text-[13px] text-muted">{suffix}</span>}
        </p>
        {sub && <p className="mt-1 truncate text-[11px] text-muted">{sub}</p>}
      </div>
    </Card>
  )
}

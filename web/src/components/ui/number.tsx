import NumberFlow, { type Format } from '@number-flow/react'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'

/**
 * 会变化的数字统一走 NumberFlow：数位逐个滚动、等宽、千分位。
 * 降低动效时直接落终值；后台标签页里 NumberFlow 自己会跳过动画。
 */
export function Num({
  value,
  format,
  suffix,
  prefix,
  className,
}: {
  value: number
  format?: Format
  suffix?: string
  prefix?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <NumberFlow
      value={value}
      format={format}
      suffix={suffix}
      prefix={prefix}
      locales="zh-CN"
      animated={!reduced}
      willChange
      className={cn('tabular-nums', className)}
      transformTiming={{ duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' }}
      spinTiming={{ duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' }}
    />
  )
}

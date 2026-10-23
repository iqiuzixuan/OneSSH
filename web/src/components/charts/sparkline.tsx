import { useId } from 'react'
import { cn } from '@/lib/cn'

/**
 * 火花线：主机卡里的 CPU 小曲线。单色（墨色线 + 极淡面积），不画坐标轴。
 * 纵轴留 5 个点的余量：既不把平稳曲线贴到边上，也不把小波动放大成假峰。
 */
export function Sparkline({
  values,
  max = 100,
  className,
  strokeClassName,
}: {
  values: number[]
  /** 固定上限（百分比类传 100）；传 'auto' 按数据取 */
  max?: number | 'auto'
  className?: string
  strokeClassName?: string
}) {
  const gradient = useId()
  if (values.length < 2) return null
  const lo = Math.max(0, Math.min(...values) - 5)
  const hiRaw = max === 'auto' ? Math.max(...values) : max
  const hi = max === 'auto' ? hiRaw + Math.max(1, hiRaw * 0.1) : Math.min(max, Math.max(...values) + 5)
  const span = hi - lo || 1
  const w = 100
  const h = 40
  const points = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - lo) / span) * (h - 6)] as const)
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')
  const area = `${line}L${w},${h}L0,${h}Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('block h-10 w-full overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradient})`} />
      <path
        d={line}
        fill="none"
        className={cn('stroke-ink-2', strokeClassName)}
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 迷你柱：KPI 卡右下角的 24 小时分布；最后一根（当前时段）用墨色，危险态用红 */
export function MiniBars({
  values,
  highlightLast = true,
  tone,
  className,
}: {
  values: number[]
  highlightLast?: boolean
  tone?: 'bad'
  className?: string
}) {
  const max = Math.max(1, ...values)
  return (
    <span className={cn('flex h-[22px] items-end gap-[2px]', className)} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            'w-[3px] rounded-[2px] transition-[height,background-color] duration-500 ease-[var(--ease-out)]',
            highlightLast && i === values.length - 1 ? (tone === 'bad' ? 'bg-bad' : 'bg-ink') : 'bg-ink-4',
          )}
          style={{ height: `${Math.max(2, (v / max) * 22)}px` }}
        />
      ))}
    </span>
  )
}

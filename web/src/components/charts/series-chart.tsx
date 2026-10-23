import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export type SeriesPoint = { ts: number; value: number | null | undefined }

/**
 * 时序面积图：单色墨线 + 极淡面积，虚线网格，悬停出十字线、圆点与深色气泡。
 * 用 SVG 手绘而不是图表库：形态简单，样式要完全贴合 token，体积也小得多。
 */
export function SeriesChart({
  points,
  height = 168,
  max,
  format = (v) => v.toFixed(1),
  unit = '',
  className,
  ariaLabel,
}: {
  points: SeriesPoint[]
  height?: number
  /** 固定上限（百分比传 100）；缺省按数据自动放大 15% */
  max?: number
  format?: (value: number) => string
  unit?: string
  className?: string
  ariaLabel?: string
}) {
  const gradient = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(120, entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const data = points.filter((p): p is { ts: number; value: number } => p.value != null && !Number.isNaN(p.value))
  const padTop = 8
  const padBottom = 20
  const plotH = height - padTop - padBottom
  const hi = max ?? Math.max(1, ...data.map((p) => p.value)) * 1.15
  const t0 = data[0]?.ts ?? 0
  const t1 = data[data.length - 1]?.ts ?? 1
  const x = (ts: number) => ((ts - t0) / (t1 - t0 || 1)) * width
  const y = (v: number) => padTop + plotH - (Math.min(v, hi) / hi) * plotH

  const line = data.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const area = data.length > 1 ? `${line}L${width},${padTop + plotH}L0,${padTop + plotH}Z` : ''

  const onMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (data.length < 2) return
      const rect = event.currentTarget.getBoundingClientRect()
      const ts = t0 + ((event.clientX - rect.left) / rect.width) * (t1 - t0)
      let best = 0
      for (let i = 1; i < data.length; i++) {
        if (Math.abs(data[i].ts - ts) < Math.abs(data[best].ts - ts)) best = i
      }
      setHover(best)
    },
    [data, t0, t1],
  )

  const active = hover != null ? data[hover] : null
  const clock = (ts: number) => new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div ref={wrap} className={cn('relative', className)} style={{ height }}>
      {data.length < 2 ? (
        <div className="grid h-full place-items-center text-[12px] text-ink-3">采样点不足，暂无曲线</div>
      ) : (
        <svg
          width={width}
          height={height}
          className="block overflow-visible"
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.09" />
              <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={0} x2={width} y1={padTop + plotH * f} y2={padTop + plotH * f} stroke="var(--line)" strokeDasharray="2 3" />
              <text x={width} y={padTop + plotH * f - 4} textAnchor="end" className="fill-ink-3 stroke-surface font-mono text-[10.5px] [paint-order:stroke] [stroke-width:3px] [stroke-linejoin:round]">
                {format(hi * (1 - f))}
                {unit}
              </text>
            </g>
          ))}
          <path d={area} fill={`url(#${gradient})`} />
          <path d={line} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeLinejoin="round" />
          <text x={0} y={height - 4} className="fill-ink-3 stroke-surface font-mono text-[10.5px] [paint-order:stroke] [stroke-width:3px] [stroke-linejoin:round]">
            {clock(t0)}
          </text>
          <text x={width / 2} y={height - 4} textAnchor="middle" className="fill-ink-3 stroke-surface font-mono text-[10.5px] [paint-order:stroke] [stroke-width:3px] [stroke-linejoin:round]">
            {clock(t0 + (t1 - t0) / 2)}
          </text>
          <text x={width} y={height - 4} textAnchor="end" className="fill-ink-3 stroke-surface font-mono text-[10.5px] [paint-order:stroke] [stroke-width:3px] [stroke-linejoin:round]">
            现在
          </text>
          {active && (
            <g>
              <line x1={x(active.ts)} x2={x(active.ts)} y1={padTop} y2={padTop + plotH} stroke="var(--ink-3)" />
              <circle cx={x(active.ts)} cy={y(active.value)} r={3.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
            </g>
          )}
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
        </svg>
      )}
      {active && (
        <div
          className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-[8px] bg-tooltip px-2 py-1 font-mono text-[11.5px] whitespace-nowrap text-tooltip-fg shadow-[0_6px_16px_-4px_rgb(0_0_0/.3)]"
          style={{ left: Math.min(Math.max(x(active.ts), 48), width - 48) }}
        >
          <b className="font-semibold">
            {format(active.value)}
            {unit}
          </b>{' '}
          · {clock(active.ts)}
        </div>
      )}
    </div>
  )
}

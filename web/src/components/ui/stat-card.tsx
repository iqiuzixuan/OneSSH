import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { staggerItem } from '@/lib/motion'
import { Dot, type Tone } from './badge'
import { Card } from './card'
import { Num } from './number'

/**
 * KPI 卡：标签 + 大号滚动数字 + 底部一行说明 / 迷你图。
 * 数字只在有状态意义时上色（拒绝数 > 0 用红），否则保持墨色。
 */
export function Kpi({
  label,
  value,
  suffix,
  tone,
  dot,
  foot,
  aside,
  className,
}: {
  label: React.ReactNode
  value: number
  suffix?: string
  /** 数字本身的语义色 */
  tone?: Tone
  /** 标签前的状态点 */
  dot?: { tone: Tone; live?: boolean }
  foot?: React.ReactNode
  /** 底部右侧：迷你柱、比例条 */
  aside?: React.ReactNode
  className?: string
}) {
  return (
    <motion.div variants={staggerItem}>
      <Card className={cn('flex min-h-[132px] flex-col px-4 py-3.5', className)}>
        <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
          {dot && <Dot tone={dot.tone} live={dot.live} className="size-1.5" />}
          {label}
        </div>
        {/* 迷你图与大数字同一行、底对齐：底部说明独占一行，窄卡里也不会被挤成省略号 */}
        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div
            className={cn(
              'text-[30px] leading-none font-medium tracking-[-0.03em]',
              tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-ink',
            )}
          >
            <Num value={value} suffix={suffix} />
          </div>
          {aside && <div className="mb-0.5 min-w-0 overflow-hidden">{aside}</div>}
        </div>
        <div className="mt-auto truncate pt-3 text-[12px] text-ink-3">{foot}</div>
      </Card>
    </motion.div>
  )
}

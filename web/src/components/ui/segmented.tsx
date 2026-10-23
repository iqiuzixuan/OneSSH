import { motion } from 'motion/react'
import { useId } from 'react'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

export type SegmentedOption<T extends string> = {
  value: T
  label: React.ReactNode
  /** 选项右侧的计数，等宽小字 */
  count?: number
  /** 只有图标时给读屏的名字 */
  title?: string
}

/**
 * 分段控件：外壳圆角 10、内边距 3，选中块圆角 7 = 10 − 3（同心）。
 * 选中块是一个共享布局元素，切换时弹簧滑到新位置，而不是闪现。
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  'aria-label': ariaLabel,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  size?: 'sm' | 'md'
  'aria-label'?: string
  className?: string
}) {
  const layoutId = useId()
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('relative inline-flex shrink-0 rounded-ctl bg-bg-sunk p-[3px] shadow-well', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.title}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 rounded-ctl-in whitespace-nowrap transition-colors duration-150',
              size === 'sm' ? 'h-[22px] px-2 text-[12px]' : 'h-[26px] px-2.5 text-[12.5px]',
              active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-ctl-in bg-surface shadow-seg"
                transition={spring.snap}
              />
            )}
            <span className="relative z-[1] inline-flex items-center gap-1.5 [&_svg]:size-3.5">
              {option.label}
              {option.count != null && (
                <span className="font-mono text-[11px] font-medium text-ink-3 tabular-nums">{option.count}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

import { cn } from '@/lib/cn'

export type SegmentedOption<T extends string> = { value: T; label: string }

/**
 * 分段控件：最高频的那个筛选维度直接平铺成一行（demo 的 .seg），
 * 激活项浮成白色表面；替代「点开下拉再选一步」的两跳交互。
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  'aria-label'?: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex shrink-0 gap-0.5 rounded-full bg-surface-2 p-[3px]', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full px-3.5 py-1 text-[11.5px] whitespace-nowrap text-muted transition-all duration-150 hover:text-text',
            value === option.value && 'bg-surface font-semibold text-text shadow-[0_1px_3px_rgba(16,24,40,0.12)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

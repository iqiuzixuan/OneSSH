import * as SelectPrimitive from '@radix-ui/react-select'
import { CaretDown, Check } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

export type SelectOption<T extends string | number> = { value: T; label: string }

/**
 * Radix Select 的受控封装：对外用真实值类型（number 主机 id 常见），
 * 内部转字符串——Radix 只接受 string，这层转换必须集中，否则各页面各写一遍容易漏。
 */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = '请选择',
  className,
  disabled,
  id,
  invalid,
  'aria-label': ariaLabel,
}: {
  value: T | undefined
  onChange: (value: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
  invalid?: boolean
  /** 触发器的无障碍名：同一控件在桌面/移动各挂一份时用它在两处都能命名，避免共享 id */
  'aria-label'?: string
}) {
  const isNumeric = options.length > 0 && typeof options[0].value === 'number'
  return (
    <SelectPrimitive.Root
      value={value == null ? undefined : String(value)}
      onValueChange={(v) => onChange((isNumeric ? Number(v) : v) as T)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn(
          'inline-flex h-9 w-full items-center justify-between gap-2 rounded-control border bg-surface px-3 text-sm text-text',
          'transition-colors duration-150 hover:border-border-strong',
          'focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-muted',
          invalid ? 'border-danger' : 'border-border',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <CaretDown size={14} className="text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-container border border-border bg-surface p-1 shadow-pop"
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={String(o.value)}
                value={String(o.value)}
                className="relative flex cursor-pointer items-center rounded-control py-1.5 pr-8 pl-3 text-sm text-text select-none data-[highlighted]:bg-surface-2 data-[highlighted]:outline-none"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                  <Check size={14} className="text-accent" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
            {options.length === 0 && <p className="px-3 py-2 text-[13px] text-muted">暂无选项</p>}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

import * as SelectPrimitive from '@radix-ui/react-select'
import { CaretUpDown, Check } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

export type SelectOption<T extends string | number> = { value: T; label: string; description?: string }

/**
 * Radix Select 的受控封装：对外用真实值类型（number 主机 id 常见），
 * 内部转字符串——Radix 只接受 string，这层转换必须集中。
 * 弹层圆角 14、内边距 6，选项圆角 8 = 14 − 6（同心）。
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
          'inline-flex h-8 w-full items-center justify-between gap-2 rounded-ctl bg-surface px-2.5 text-[13px] text-ink shadow-ctl',
          'outline-none transition-shadow duration-150 focus-visible:shadow-focus',
          'disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-ink-3',
          invalid && 'shadow-[0_0_0_1px_var(--bad)]',
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <CaretUpDown size={14} className="text-ink-3" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            'z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-pop bg-surface p-1.5 shadow-pop',
            'origin-[var(--radix-select-content-transform-origin)] data-[state=open]:animate-pop-in',
          )}
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={String(o.value)}
                value={String(o.value)}
                className="relative flex h-8 cursor-pointer items-center gap-2 rounded-pop-in pr-8 pl-2.5 text-[13px] text-ink outline-none select-none data-[highlighted]:bg-hover-2"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                {o.description && <span className="truncate font-mono text-[11px] text-ink-3">{o.description}</span>}
                <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                  <Check size={14} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
            {options.length === 0 && <p className="px-2.5 py-2 text-[12.5px] text-ink-3">暂无选项</p>}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

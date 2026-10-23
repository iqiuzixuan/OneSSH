import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, Minus } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

/** 16px 复选框，选中反转为实心墨色；'indeterminate' 半选态用于表头「全选」 */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
}: {
  checked: boolean | 'indeterminate'
  onCheckedChange?: (checked: boolean | 'indeterminate') => void
  disabled?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[5px] bg-surface shadow-[0_0_0_1px_var(--edge-2),0_1px_1px_rgb(0_0_0/.04)]',
        'transition-[background-color,box-shadow] duration-150',
        'data-[state=checked]:bg-primary data-[state=checked]:shadow-[0_0_0_1px_var(--primary)]',
        'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:shadow-[0_0_0_1px_var(--primary)]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="text-primary-fg">
        {checked === 'indeterminate' ? <Minus size={11} weight="bold" /> : <Check size={11} weight="bold" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

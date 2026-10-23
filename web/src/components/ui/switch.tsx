import * as SwitchPrimitive from '@radix-ui/react-switch'
import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

/**
 * 开关：轨道 32×18，滑块 14。开启时轨道变实心墨色；danger 开关开启时变红，
 * 用于「允许管理主机」这类需要分量的权限。滑块位移走弹簧，可打断。
 */
export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  danger,
  className,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id?: string
  disabled?: boolean
  danger?: boolean
  className?: string
  'aria-label'?: string
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors duration-200',
        'shadow-[inset_0_1px_2px_rgb(0_0_0/.1)] disabled:cursor-not-allowed disabled:opacity-50',
        checked ? (danger ? 'bg-bad' : 'bg-primary') : 'bg-ink-4',
        className,
      )}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          className={cn(
            'block size-3.5 rounded-full shadow-[0_1px_2px_rgb(0_0_0/.25),0_0_0_.5px_rgb(0_0_0/.05)]',
            checked && !danger ? 'bg-primary-fg' : 'bg-white',
          )}
          initial={false}
          animate={{ x: checked ? 16 : 2 }}
          transition={spring.snap}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}

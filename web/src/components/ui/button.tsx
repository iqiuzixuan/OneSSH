import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { Spinner } from './spinner'

/**
 * 按钮：控件圆角 10（sm 为 9），阴影环代替边框。
 * primary 是唯一的实心墨色按钮，一屏里通常只出现一个；危险动作用 danger（红字）
 * 或 danger-solid（确认弹窗里的最终一步）。按下统一 scale(.97)。
 */
const button = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap select-none ' +
    'transition-[background-color,box-shadow,color,opacity,transform] duration-150 ease-[var(--ease-out)] ' +
    'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ' +
    '[&_svg]:shrink-0',
  {
    variants: {
      variant: {
        secondary:
          'bg-surface text-ink shadow-ctl hover:bg-[color-mix(in_srgb,var(--surface)_92%,var(--ink))]',
        primary:
          'bg-primary text-primary-fg shadow-primary hover:bg-[color-mix(in_srgb,var(--primary)_86%,var(--bg))]',
        ghost: 'text-ink-2 hover:bg-hover-2 hover:text-ink',
        danger: 'bg-surface text-bad shadow-ctl hover:bg-bad-soft',
        'danger-solid':
          'bg-bad text-white shadow-[0_0_0_1px_var(--bad),inset_0_1px_0_rgb(255_255_255/.18),0_1px_2px_rgb(0_0_0/.15)] hover:bg-[color-mix(in_srgb,var(--bad)_88%,#000)]',
      },
      size: {
        sm: 'h-7 rounded-[9px] px-2.5 text-[12.5px] [&_svg]:size-3.5',
        md: 'h-8 rounded-ctl px-3 text-[13px] [&_svg]:size-[15px]',
        lg: 'h-10 rounded-ctl px-4 text-[14px] [&_svg]:size-4',
        icon: 'size-8 rounded-ctl [&_svg]:size-[15px]',
        'icon-sm': 'size-7 rounded-[9px] [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & { loading?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(button({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  )
})

export { button as buttonVariants }

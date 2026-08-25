import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> & {
  /** 左侧图标槽 */
  prefix?: React.ReactNode
  invalid?: boolean
  /** 全胶囊外形（demo 的搜索框）；表单录入仍用控件圆角，检索场景才传 */
  pill?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, prefix, invalid, pill, ...props },
  ref,
) {
  const field = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full border bg-surface px-3 text-sm text-text',
        pill ? 'rounded-full' : 'rounded-control',
        'placeholder:text-faint transition-colors duration-150',
        'hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid ? 'border-danger' : 'border-border',
        prefix && 'pl-9',
        className,
      )}
      {...props}
    />
  )
  if (!prefix) return field
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">
        {prefix}
      </span>
      {field}
    </div>
  )
})

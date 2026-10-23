import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full resize-y rounded-ctl bg-surface px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink',
        'outline-none placeholder:text-ink-3 transition-shadow duration-150',
        invalid
          ? 'shadow-[0_0_0_1px_var(--bad)] focus:shadow-[0_0_0_1px_var(--bad),0_0_0_4px_var(--bad-soft)]'
          : 'shadow-ctl focus:shadow-focus',
        className,
      )}
      {...props}
    />
  )
})

import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'> & {
  /** 左侧图标槽 */
  prefix?: React.ReactNode
  /** 右侧槽：快捷键提示、清空按钮等 */
  suffix?: React.ReactNode
  invalid?: boolean
  size?: 'md' | 'lg'
  /** 外壳的类名（宽度等）；className 作用在 input 本身 */
  wrapperClassName?: string
}

/**
 * 输入框：外壳承担阴影环与聚焦光环，input 本身透明。
 * 聚焦时环加深并外扩一圈极淡的光晕，不用彩色——静流的焦点只靠明度区分。
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, wrapperClassName, prefix, suffix, invalid, size = 'md', disabled, ...props },
  ref,
) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 rounded-ctl bg-surface px-2.5 text-ink-3 transition-shadow duration-150',
        size === 'lg' ? 'h-10 text-[14px]' : 'h-8 text-[13px]',
        // 两套环互斥地给出，不靠类名覆盖顺序：出错时聚焦也要保持红环
        invalid
          ? 'shadow-[0_0_0_1px_var(--bad)] focus-within:shadow-[0_0_0_1px_var(--bad),0_0_0_4px_var(--bad-soft)]'
          : 'shadow-ctl focus-within:shadow-focus',
        disabled && 'opacity-60',
        wrapperClassName,
      )}
    >
      {prefix && <span className="flex shrink-0 items-center [&_svg]:size-[15px]">{prefix}</span>}
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
      {suffix && <span className="flex shrink-0 items-center gap-1">{suffix}</span>}
    </div>
  )
})

/** 快捷键提示：⌘K、Esc、↵ */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-well-2 px-1 font-mono text-[10.5px] leading-none font-medium text-ink-2',
        className,
      )}
      {...props}
    />
  )
}

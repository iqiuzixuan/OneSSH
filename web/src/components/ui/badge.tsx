import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/** 徽章全胶囊，与按钮、标签页同属胶囊家族 */
const BADGE_BASE =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap'

const badge = cva(BADGE_BASE, {
  variants: {
    variant: {
      default: 'bg-surface-2 text-muted',
      // 彩色徽章带描边（demo 的 .chip.ok/.warn/.err）：同色边框 + 软底 + 深字
      accent: 'border border-accent/45 bg-accent-soft text-accent-ink',
      success: 'border border-success/40 bg-success/12 text-success',
      warning: 'border border-warning/45 bg-warning/12 text-warning',
      danger: 'border border-danger/40 bg-danger/12 text-danger',
      // 蓝色留给「推断/参考性」这类次等信息，与 Chip 的 info 色调一致，不占主题色
      info: 'border border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      outline: 'border border-border text-muted',
    },
  },
  defaultVariants: { variant: 'default' },
})

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badge({ variant }), className)} {...props} />
}

/**
 * 值即徽章的哈希取色：djb2 哈希直接映射成色相（360 取色），
 * 同一个值永远同一个颜色，不同的值几乎必然不同色——枚举池再大也会撞，色相环不会。
 * 样式是 demo 的 .chip.ok：同色描边 + 软底填充 + 深字；色相走 CSS 变量，换主题色不影响分类色。
 */
export function HashBadge({
  value,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { value: string }) {
  let hash = 5381
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }
  const hue = (hash >>> 0) % 360
  return (
    <span
      {...props}
      style={{ '--hb-hue': hue, ...props.style } as React.CSSProperties}
      className={cn(
        BADGE_BASE,
        'border border-[hsl(var(--hb-hue)_62%_68%)] bg-[hsl(var(--hb-hue)_72%_93%)] text-[hsl(var(--hb-hue)_58%_35%)]',
        'dark:border-[hsl(var(--hb-hue)_42%_45%)] dark:bg-[hsl(var(--hb-hue)_40%_24%)] dark:text-[hsl(var(--hb-hue)_70%_72%)]',
        className,
      )}
    />
  )
}

/**
 * 大写描边小签（demo 的 .chip）：主机/会话等持续状态的标识，
 * 与 Badge（填充底、内容标签）区分开——Chip 描边实色、字号更小、全大写。
 */
const chip = cva(
  'inline-flex items-center rounded-full border px-[9px] py-[3px] text-[9.5px] font-medium tracking-[0.1em] whitespace-nowrap uppercase',
  {
    variants: {
      tone: {
        neutral: 'border-border text-muted',
        accent: 'border-accent bg-accent-soft text-accent-ink',
        warning:
          'border-warning bg-[color-mix(in_srgb,var(--warning)_9%,transparent)] text-warning',
        danger: 'border-danger bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] text-danger',
        info: 'border-blue-500 bg-blue-500/10 text-blue-600 dark:border-blue-400 dark:text-blue-400',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type ChipProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof chip>

export function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chip({ tone }), className)} {...props} />
}

/** 状态点：running 场景加脉冲 */
export function Dot({ className, pulse }: { className?: string; pulse?: boolean }) {
  return (
    <span
      className={cn('inline-block size-1.5 rounded-full bg-current', pulse && 'animate-pulse', className)}
      aria-hidden
    />
  )
}

/**
 * LED 状态灯：带 3px 同色拉丝光晕的状态点，用于主机在线/忙碌/异常等持续状态。
 * 光晕用 color-mix 从状态色派生，不新增令牌。
 */
export function Led({
  tone,
  pulse,
  className,
}: {
  tone: 'on' | 'busy' | 'err' | 'off'
  pulse?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-[7px] shrink-0 rounded-full',
        tone === 'on' && 'bg-accent shadow-[0_0_0_3px_var(--accent-soft)]',
        tone === 'busy' &&
          'bg-warning shadow-[0_0_0_3px_color-mix(in_srgb,var(--warning)_15%,transparent)]',
        tone === 'err' &&
          'bg-danger shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_12%,transparent)]',
        tone === 'off' && 'bg-border-strong',
        pulse && 'animate-pulse',
        className,
      )}
    />
  )
}

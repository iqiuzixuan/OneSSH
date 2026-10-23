import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/**
 * 状态的四种语义色：ok 绿、warn 琥珀、bad 红，其余一律中性灰。
 * 界面里出现颜色，就意味着有状态值得看——不要把颜色用来做装饰或区分类别。
 */
export type Tone = 'neutral' | 'ok' | 'warn' | 'bad'

/** 状态点：7px 实心圆；idle 是空心圈（未监控 / 未知）；live 在外圈加一道呼吸涟漪 */
export function Dot({
  tone = 'neutral',
  idle,
  live,
  className,
  label,
}: {
  tone?: Tone
  idle?: boolean
  live?: boolean
  className?: string
  /** 给读屏的状态说明；不传则视为装饰 */
  label?: string
}) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'relative inline-block size-[7px] shrink-0 rounded-full',
        idle
          ? 'bg-transparent shadow-[inset_0_0_0_1.5px_var(--ink-3)]'
          : tone === 'ok'
            ? 'bg-ok text-ok'
            : tone === 'warn'
              ? 'bg-warn text-warn'
              : tone === 'bad'
                ? 'bg-bad text-bad'
                : 'bg-ink-4 text-ink-4',
        className,
      )}
    >
      {live && !idle && (
        <span className="absolute -inset-1 animate-live rounded-full bg-current opacity-0" aria-hidden />
      )}
    </span>
  )
}

/** 胶囊：状态文字标签，如「在线」「运行中」「失败」 */
const pill = cva(
  'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap [&>span:first-child]:size-1.5',
  {
    variants: {
      tone: {
        neutral: 'bg-well-2 text-ink-2',
        ok: 'bg-ok-soft text-ok',
        warn: 'bg-warn-soft text-warn',
        bad: 'bg-bad-soft text-bad',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Pill({
  tone,
  dot,
  live,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof pill> & { dot?: boolean; live?: boolean }) {
  return (
    <span className={cn(pill({ tone }), className)} {...props}>
      {dot && <Dot tone={tone ?? 'neutral'} live={live} />}
      {children}
    </span>
  )
}

/** 标签：等宽小字，用于工具类别（EXEC / FILE）、主机标签、退出码这类「代码味」的值 */
export function Tag({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-[6px] px-1.5 font-mono text-[10.5px] leading-none font-medium tracking-[0.03em] whitespace-nowrap',
        tone === 'bad'
          ? 'bg-bad-soft text-bad'
          : tone === 'warn'
            ? 'bg-warn-soft text-warn'
            : tone === 'ok'
              ? 'bg-ok-soft text-ok'
              : 'bg-well-2 text-ink-2',
        className,
      )}
      {...props}
    />
  )
}

/**
 * 筛选芯片：可点击的小胶囊，选中时反转为实心墨色。
 * 用于标签筛选、快捷命令这类「一排平铺、可多选」的场景。
 */
export const Chip = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; mono?: boolean }
>(function Chip({ active, mono, className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[11.5px] whitespace-nowrap',
        'transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.96]',
        mono && 'font-mono text-[11px]',
        active
          ? 'bg-primary text-primary-fg'
          : 'bg-well text-ink-2 shadow-[inset_0_0_0_1px_var(--edge)] hover:bg-well-2 hover:text-ink',
        className,
      )}
      {...props}
    />
  )
})

/** 头像块：令牌 / Agent 的两字母缩写，等宽字，中性底 */
export function Initials({ name, className }: { name: string; className?: string }) {
  // 取首个词的前两个字母：Claude Code / Codex CLI / Cursor 都以 C 开头，按词首字母会撞成 CC
  const word = name.replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, ' ').trim().split(/\s+/)[0] ?? ''
  const letters = (/^[\u4e00-\u9fa5]/.test(word) ? word.slice(0, 1) : word.slice(0, 2)).toUpperCase() || '··'
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-[9px] bg-well-2 font-mono text-[11px] font-semibold text-ink-2 shadow-well',
        className,
      )}
    >
      {letters}
    </span>
  )
}

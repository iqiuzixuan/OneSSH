import { cn } from '@/lib/cn'

/** 空状态：一个井底图标块 + 标题 + 一句解释 + 可选动作。解释要说清「为什么空、接下来做什么」 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-1.5 px-4 pt-14 pb-15 text-center', className)}>
      {icon && (
        <div className="mb-2 grid size-11 place-items-center rounded-[13px] bg-well text-ink-3 shadow-well [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {description && <p className="max-w-[40ch] text-[12.5px] leading-relaxed text-ink-2">{description}</p>}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  )
}

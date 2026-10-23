import { cn } from '@/lib/cn'

/**
 * 卡片与井：同心圆角的两层。卡片外圆角 16、内边距 6，里面的「井」圆角 10 = 16 − 6。
 * 卡片用环形阴影代替边框；井是卡片里下沉的一块，用来放指标、输出、表单分组。
 * 不要卡片套卡片——第二层一律用 Well。
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card bg-surface shadow-card', className)} {...props} />
}

export function Well({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-well bg-well shadow-well', className)} {...props} />
}

/** 卡片头：标题 + 次要说明 + 右侧动作 */
export function CardHeader({
  title,
  sub,
  actions,
  className,
}: {
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-3.5 pt-3 pb-2.5', className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">{title}</h3>
        {sub && <p className="mt-0.5 text-[12px] text-ink-3">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** 区块标题：卡片外、页面里的二级标题行，右侧常放「查看全部 →」 */
export function SectionHeader({
  title,
  actions,
  className,
}: {
  title: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-0.5 mt-7 mb-3 flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-[14px] font-semibold tracking-[-0.005em]">{title}</h2>
      {actions}
    </div>
  )
}

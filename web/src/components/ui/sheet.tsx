import { X } from '@phosphor-icons/react'
import { Drawer } from 'vaul'
import { cn } from '@/lib/cn'

/**
 * 右侧悬浮面板（vaul）：离视口四边各 8px，外圆角 20；
 * 面板内的分组是井，圆角 12 = 20 − 8（同心）。可向右拖拽关闭，Esc / 点遮罩也能关。
 * 详情类内容（主机、命令运行）都用它承载，并由路由驱动开合，链接可直接分享。
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  meta,
  status,
  actions,
  width = 560,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  /** 标题下一行的等宽元信息，如 user@addr:port */
  meta?: React.ReactNode
  /** 标题右侧的状态胶囊 */
  status?: React.ReactNode
  /** 标题区下方的一排动作按钮 */
  actions?: React.ReactNode
  width?: number
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <Drawer.Content
          aria-describedby={undefined}
          className={cn(
            'fixed top-2 right-2 bottom-2 z-[51] flex flex-col overflow-hidden rounded-sheet bg-surface shadow-pop outline-none',
            className,
          )}
          style={
            {
              width: `min(${width}px, calc(100vw - 16px))`,
              // 悬浮面板离右边有 8px，初始位移要多推出这 8px，否则入场第一帧会露边
              '--initial-transform': 'calc(100% + 8px)',
            } as React.CSSProperties
          }
        >
          <div className="group/sheet relative shrink-0 px-5 pt-[18px] pb-3.5">
            <span
              aria-hidden
              className="absolute top-1/2 left-1.5 -mt-5 h-10 w-1 rounded-full bg-ink-4 opacity-0 transition-opacity duration-200 group-hover/sheet:opacity-100"
            />
            <div className="flex items-center gap-2.5">
              <Drawer.Title className="min-w-0 truncate text-[18px] leading-tight font-semibold tracking-[-0.02em]">
                {title}
              </Drawer.Title>
              {status}
              <Drawer.Close
                className="ml-auto grid size-8 shrink-0 place-items-center rounded-ctl text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink"
                aria-label="关闭"
              >
                <X size={16} />
              </Drawer.Close>
            </div>
            {meta && <div className="mt-1.5 font-mono text-[12px] text-ink-2">{meta}</div>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-1.5 px-5 pb-3.5">{actions}</div>}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" data-vaul-no-drag>
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/** 面板里的一个分组：井底 + 标题行 */
export function SheetSection({
  title,
  sub,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  bodyClassName?: string
  children?: React.ReactNode
}) {
  return (
    <section className={cn('rounded-sheet-in bg-well shadow-well', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2.5 px-3.5 pt-3 pb-1">
          <h3 className="text-[12.5px] font-semibold">{title}</h3>
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            {sub}
            {actions}
          </div>
        </div>
      )}
      <div className={cn('px-3.5 pt-1.5 pb-3.5', bodyClassName)}>{children}</div>
    </section>
  )
}

/** 键值对列表：左侧 76px 标签，右侧值截断 */
export function KeyValues({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; mono?: boolean }[]
  className?: string
}) {
  return (
    <dl className={cn('grid grid-cols-[76px_minmax(0,1fr)] gap-x-2.5 gap-y-2 text-[12.5px]', className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-ink-3">{item.label}</dt>
          <dd className={cn('m-0 min-w-0 truncate', item.mono && 'font-mono text-[12px]')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

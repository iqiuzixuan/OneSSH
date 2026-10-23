import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { scrimTransition, spring } from '@/lib/motion'

const widths = { sm: 'max-w-[440px]', md: 'max-w-[560px]', lg: 'max-w-[720px]', xl: 'max-w-[860px]' } as const

/** 遮罩：只做透明度。Radix 会经 Slot 给它传 ref，必须 forwardRef */
export const Scrim = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  function Scrim(props, ref) {
    return (
      <DialogPrimitive.Overlay ref={ref} asChild forceMount {...props}>
        <motion.div
          className="fixed inset-0 z-[60] bg-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={scrimTransition}
        />
      </DialogPrimitive.Overlay>
    )
  },
)

/**
 * 对话框：外圆角 18、内边距 6；底部动作区是一块井，圆角 12 = 18 − 6。
 * 进入从 0.96 弹到 1，退出更快——关掉的东西不该让人等。
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  size = 'sm',
  footer,
  bare,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  /** 标题上方的图标块 */
  icon?: React.ReactNode
  size?: keyof typeof widths
  footer?: React.ReactNode
  /** 不渲染默认的标题区，由 children 自己排版（向导、命令面板这类） */
  bare?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <Scrim />
            <div className="pointer-events-none fixed inset-0 z-[61] grid place-items-center p-4">
              <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  className={cn(
                    'pointer-events-auto flex max-h-[min(88dvh,820px)] w-full flex-col rounded-dlg bg-surface p-1.5 shadow-pop outline-none',
                    widths[size],
                    className,
                  )}
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0, transition: spring.soft }}
                  exit={{ opacity: 0, scale: 0.97, y: 4, transition: spring.exit }}
                >
                  {bare ? (
                    <>
                      <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                      {children}
                    </>
                  ) : (
                    <>
                      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4">
                        {icon && (
                          <div className="mb-3.5 grid size-9 place-items-center rounded-[11px] bg-well text-ink-2 shadow-well [&_svg]:size-[18px]">
                            {icon}
                          </div>
                        )}
                        <DialogPrimitive.Title className="pr-8 text-[15px] font-semibold tracking-[-0.01em]">
                          {title}
                        </DialogPrimitive.Title>
                        {description && (
                          <DialogPrimitive.Description className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                            {description}
                          </DialogPrimitive.Description>
                        )}
                        <DialogPrimitive.Close
                          className="absolute top-3 right-3 grid size-7 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink"
                          aria-label="关闭"
                        >
                          <X size={15} />
                        </DialogPrimitive.Close>
                        {children && <div className={cn(description || icon ? 'mt-4' : 'mt-3')}>{children}</div>}
                      </div>
                      {footer && (
                        <div className="flex shrink-0 items-center justify-end gap-2 rounded-dlg-in bg-well p-2.5 shadow-well">
                          {footer}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

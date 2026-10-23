import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { Warning } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { scrimTransition, spring } from '@/lib/motion'
import { Button } from './button'

/**
 * 破坏性操作确认：与 Dialog 同一套同心结构（外 18 / 内 6 / 动作井 12）。
 * danger 时图标块与确认按钮变红；确认中按钮转圈，期间不能取消。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认',
  danger,
  icon,
  children,
  confirmDisabled,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmText?: string
  danger?: boolean
  icon?: React.ReactNode
  /** 额外内容，如「输入主机名以确认」 */
  children?: React.ReactNode
  confirmDisabled?: boolean
  onConfirm: () => void | Promise<unknown>
}) {
  const [pending, setPending] = useState(false)

  const confirm = async () => {
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AnimatePresence>
        {open && (
          <AlertDialogPrimitive.Portal forceMount>
            <AlertDialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[60] bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={scrimTransition}
              />
            </AlertDialogPrimitive.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[61] grid place-items-center p-4">
              <AlertDialogPrimitive.Content asChild forceMount>
                <motion.div
                  className="pointer-events-auto w-full max-w-[440px] rounded-dlg bg-surface p-1.5 shadow-pop outline-none"
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0, transition: spring.soft }}
                  exit={{ opacity: 0, scale: 0.97, y: 4, transition: spring.exit }}
                >
                  <div className="px-4 pt-4 pb-4.5">
                    <div
                      className={cn(
                        'mb-3.5 grid size-9 place-items-center rounded-[11px] [&_svg]:size-[18px]',
                        danger ? 'bg-bad-soft text-bad' : 'bg-well text-ink-2 shadow-well',
                      )}
                    >
                      {icon ?? <Warning weight="bold" />}
                    </div>
                    <AlertDialogPrimitive.Title className="text-[15px] font-semibold tracking-[-0.01em]">
                      {title}
                    </AlertDialogPrimitive.Title>
                    {description ? (
                      <AlertDialogPrimitive.Description className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                        {description}
                      </AlertDialogPrimitive.Description>
                    ) : (
                      <AlertDialogPrimitive.Description className="sr-only">{title}</AlertDialogPrimitive.Description>
                    )}
                    {children && <div className="mt-4">{children}</div>}
                  </div>
                  <div className="flex justify-end gap-2 rounded-dlg-in bg-well p-2.5 shadow-well">
                    <AlertDialogPrimitive.Cancel asChild>
                      <Button disabled={pending}>取消</Button>
                    </AlertDialogPrimitive.Cancel>
                    <Button
                      variant={danger ? 'danger-solid' : 'primary'}
                      loading={pending}
                      disabled={confirmDisabled}
                      onClick={() => void confirm()}
                    >
                      {confirmText}
                    </Button>
                  </div>
                </motion.div>
              </AlertDialogPrimitive.Content>
            </div>
          </AlertDialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </AlertDialogPrimitive.Root>
  )
}

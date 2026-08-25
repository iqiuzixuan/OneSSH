import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { overlayTransition, popTransition } from '@/lib/motion'
import { Button } from './button'

/** 统一的破坏性操作确认弹层，替代原 antd Popconfirm */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认',
  danger,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmText?: string
  danger?: boolean
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
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <AlertDialogPrimitive.Portal forceMount>
            <AlertDialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={overlayTransition}
              />
            </AlertDialogPrimitive.Overlay>
            <AlertDialogPrimitive.Content asChild forceMount>
              <motion.div
                className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-container border border-border bg-surface p-5 shadow-pop focus:outline-none"
                style={{ x: '-50%', y: '-50%' }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={popTransition}
              >
                <AlertDialogPrimitive.Title className="text-sm font-semibold text-text">
                  {title}
                </AlertDialogPrimitive.Title>
                {description && (
                  <AlertDialogPrimitive.Description className="mt-1.5 text-[13px] text-muted">
                    {description}
                  </AlertDialogPrimitive.Description>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <AlertDialogPrimitive.Cancel asChild>
                    <Button variant="outline" disabled={pending}>
                      取消
                    </Button>
                  </AlertDialogPrimitive.Cancel>
                  <Button
                    variant={danger ? 'danger' : 'primary'}
                    loading={pending}
                    onClick={confirm}
                  >
                    {confirmText}
                  </Button>
                </div>
              </motion.div>
            </AlertDialogPrimitive.Content>
          </AlertDialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </AlertDialogPrimitive.Root>
  )
}

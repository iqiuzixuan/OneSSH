import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

/** 弹层圆角 14、内边距 6，菜单项圆角 8 = 14 − 6；从触发点方向展开 */
export const DropdownMenuContent = forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-[70] min-w-48 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-pop bg-surface p-1.5 shadow-pop',
          'data-[state=open]:animate-pop-in',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
})

export const DropdownMenuItem = forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { danger?: boolean; hint?: React.ReactNode }
>(function DropdownMenuItem({ className, danger, hint, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2.5 rounded-pop-in px-2.5 text-[13px] outline-none select-none',
        'data-[highlighted]:bg-hover-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-[15px]',
        danger ? 'text-bad' : 'text-ink [&_svg]:text-ink-2',
        className,
      )}
      {...props}
    >
      {children}
      {hint && <span className="ml-auto font-mono text-[11px] text-ink-3">{hint}</span>}
    </DropdownMenuPrimitive.Item>
  )
})

export const DropdownMenuSeparator = () => <DropdownMenuPrimitive.Separator className="mx-1.5 my-1 h-px bg-line" />

export const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => (
  <DropdownMenuPrimitive.Label className="px-2.5 pt-1.5 pb-1 text-[11.5px] text-ink-3">{children}</DropdownMenuPrimitive.Label>
)

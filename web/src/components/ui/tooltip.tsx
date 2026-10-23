import * as TooltipPrimitive from '@radix-ui/react-tooltip'

export const TooltipProvider = TooltipPrimitive.Provider

/** 深色小气泡，文字 12px；只放补充信息，不放操作 */
export function Tooltip({
  content,
  side = 'top',
  children,
}: {
  content: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: React.ReactNode
}) {
  if (content == null || content === '') return <>{children}</>
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[95] max-w-xs rounded-[7px] bg-tooltip px-2 py-1 text-[12px] leading-snug text-tooltip-fg shadow-[0_6px_16px_-4px_rgb(0_0_0/.3)]"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

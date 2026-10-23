import { cn } from '@/lib/cn'

/** 骨架：井色底 + 一道缓慢扫过的高光；内容到了之后由调用方交叉淡入 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-[8px] bg-well-2',
        'after:absolute after:inset-0 after:animate-sheen after:bg-[linear-gradient(90deg,transparent,rgb(255_255_255/.5),transparent)]',
        'dark:after:bg-[linear-gradient(90deg,transparent,rgb(255_255_255/.05),transparent)]',
        className,
      )}
      {...props}
    />
  )
}

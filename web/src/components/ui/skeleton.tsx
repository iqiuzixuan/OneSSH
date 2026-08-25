import { cn } from '@/lib/cn'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-control bg-surface-2', className)} {...props} />
}

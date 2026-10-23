import { cn } from '@/lib/cn'
import { CopyButton } from './ui/code'

/**
 * 原文块：命令、stdout / stderr、配置片段这类需要原样带走的长文本。
 * 井底等宽字，右上角复制；tone="bad" 用于 stderr。clamp 时限高滚动。
 */
export function CopyableBlock({
  value,
  label = '内容',
  tone,
  clamp = true,
  prompt,
  className,
  empty,
}: {
  value: string
  label?: string
  tone?: 'bad'
  clamp?: boolean
  /** 命令前缀，如 "$" */
  prompt?: string
  className?: string
  /** value 为空时显示的占位 */
  empty?: string
}) {
  return (
    <div className={cn('relative rounded-well bg-surface shadow-card', className)}>
      <pre
        className={cn(
          'm-0 overflow-auto py-3 pr-11 pl-3.5 font-mono text-[12px] leading-[1.7] break-words whitespace-pre-wrap',
          tone === 'bad' ? 'text-bad' : 'text-ink',
          clamp && 'max-h-[340px]',
        )}
      >
        {value ? (
          <>
            {prompt && <span className="text-ink-3 select-none">{prompt} </span>}
            {value}
          </>
        ) : (
          <span className="text-ink-3">{empty ?? '（空）'}</span>
        )}
      </pre>
      {value && <CopyButton value={value} label={`复制${label}`} className="absolute top-2 right-2" />}
    </div>
  )
}

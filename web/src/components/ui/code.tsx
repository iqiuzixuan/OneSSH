import { Check, Copy } from '@phosphor-icons/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'

/** 复制到剪贴板，成功后 1.6s 内显示对勾 */
export function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string, message = '已复制') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(message)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('复制失败，请手动选择文本')
    }
  }
  return { copied, copy }
}

export function CopyButton({
  value,
  label = '复制',
  message,
  className,
}: {
  value: string
  label?: string
  message?: string
  className?: string
}) {
  const { copied, copy } = useCopy()
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        void copy(value, message)
      }}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-[8px] text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink active:scale-90',
        className,
      )}
    >
      {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
    </button>
  )
}

/** 行内等宽值 + 可选复制按钮：指纹、公钥、令牌 id 这类需要原样带走的短值 */
export function Code({
  children,
  copyable,
  className,
  title,
}: {
  children: string
  copyable?: boolean
  className?: string
  title?: string
}) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1', className)}>
      <code className="truncate font-mono text-[12px] text-ink-2 tabular-nums" title={title ?? children}>
        {children}
      </code>
      {copyable && <CopyButton value={children} className="size-6" />}
    </span>
  )
}

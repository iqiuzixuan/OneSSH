import { useState } from 'react'
import type { Host } from '@/api/types'
import { cn } from '@/lib/cn'

/**
 * 连接串 user@addr:port。地址默认做视觉脱敏（模糊），点击切换；用户名与端口保留，
 * 便于在多台主机间快速辨认。点击不冒泡：放在可点击的表格行里不会顺带打开详情。
 */
export function HostConnection({ host, className }: { host: Host; className?: string }) {
  const [revealed, setRevealed] = useState(false)
  const connection = `${host.username}@${host.addr}:${host.port}`

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        setRevealed((value) => !value)
      }}
      aria-label={revealed ? `${connection}，点击隐藏服务器地址` : `${host.name} 的服务器地址已隐藏，点击显示`}
      aria-pressed={revealed}
      title={revealed ? '点击隐藏地址' : '点击显示地址'}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center rounded-[5px] font-mono text-[12px] text-ink-2 tabular-nums transition-colors hover:text-ink',
        className,
      )}
    >
      <span className="truncate">
        {host.username}@
        <span
          className={cn(
            'inline-block transition-[filter] duration-200',
            revealed ? '' : 'blur-[4px] select-none',
          )}
        >
          {host.addr}
        </span>
        :{host.port}
      </span>
    </button>
  )
}

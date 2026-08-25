import { Terminal as TerminalIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHosts } from '@/api/queries'
import { Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Select } from '@/components/ui/select'
import { useTerminal, type TerminalStatus } from '@/hooks/use-terminal'

/** 窗口栏右侧的状态小签，措辞对齐 demo 的 connected chip */
const statusChip: Record<TerminalStatus, { label: string; tone: 'neutral' | 'accent' | 'warning' | 'danger' }> = {
  idle: { label: 'idle', tone: 'neutral' },
  connecting: { label: 'linking', tone: 'warning' },
  connected: { label: 'connected', tone: 'accent' },
  closed: { label: 'closed', tone: 'neutral' },
  error: { label: 'error', tone: 'danger' },
}

export function TerminalPage() {
  const { data: hosts = [], isLoading } = useHosts()
  // 主机卡「终端」按钮经 ?host=<name> 深链进来，进页即预选中
  const [searchParams] = useSearchParams()
  const [host, setHost] = useState<string | undefined>(() => searchParams.get('host') ?? undefined)
  const { mountRef, status, size, connect, disconnect } = useTerminal()
  const chip = statusChip[status]
  const selected = hosts.find((item) => item.name === host)

  // demo 的窗口标题串：user@host — via onessh gateway · 80×24
  const title = host
    ? `${selected?.username ?? ''}@${host} — via onessh gateway${size ? ` · ${size.cols}×${size.rows}` : ''}`
    : 'onessh gateway terminal'

  return (
    // 终端页锁定视口高度：工具条固定、终端吃满剩余空间，整页不产生外层滚动。
    // PageTransition 的 motion.div 挡在中间，只能用子选择器把高度传下去。
    <div className="h-[calc(100dvh-3.5rem)] overflow-hidden [&>div]:flex [&>div]:h-full [&>div]:flex-col">
      <PageTransition>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 md:px-8">
          <div className="shrink-0 [&>div]:mb-0">
            <PageHeader
              eyebrow="Terminal"
              title="交互终端"
              subtitle="经网关的 WebSocket 会话，全程审计"
              actions={
                <>
                  <Select
                    value={host}
                    onChange={setHost}
                    options={hosts.map((item) => ({ value: item.name, label: item.name }))}
                    placeholder="选择主机"
                    disabled={isLoading}
                    className="w-44"
                    aria-label="选择主机"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (host) void connect(host)
                    }}
                    disabled={!host || status === 'connecting'}
                    loading={status === 'connecting'}
                  >
                    {status === 'connected' ? '重新连接' : '连接'}
                  </Button>
                  {(status === 'connecting' || status === 'connected') && (
                    <Button variant="ghost" size="sm" onClick={disconnect}>
                      {status === 'connecting' ? '取消' : '断开'}
                    </Button>
                  )}
                </>
              }
            />
          </div>

          {/*
            终端卡 = 窗口（demo 的 .ttybox）：栏内只有红绿灯、等宽会话标题与状态小签，
            操作全部上移到页头。屏幕恒为深底（终端惯例，不跟随主题），深底由内层 .dark
            令牌档提供而不是写死 #0b0d10。
          */}
          <section
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-container border border-border bg-surface shadow-card"
            aria-label="终端会话"
          >
            <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-surface-2 px-3.5 py-2.5">
              <span aria-hidden className="mr-1 flex gap-1.5">
                <i className="size-[11px] rounded-full bg-[#f5655b]" />
                <i className="size-[11px] rounded-full bg-[#f6bd4f]" />
                <i className="size-[11px] rounded-full bg-[#43c465]" />
              </span>
              <span className="truncate font-mono text-[11.5px] text-muted" aria-live="polite">
                {title}
              </span>
              <Chip tone={chip.tone} className="ml-auto">
                {chip.label}
              </Chip>
            </div>
            <div className="dark relative min-h-0 flex-1 bg-bg p-2">
              <div ref={mountRef} className="h-full w-full" />
              {status === 'idle' && (
                // 不吃指针事件；bg-bg 与终端同色，取消连接回到 idle 时能盖住上一次会话的残留输出
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg">
                  <EmptyState
                    icon={<TerminalIcon size={22} />}
                    title={host ? `准备连接 ${host}` : '选择一台主机开始会话'}
                    description={
                      host
                        ? '点击右上角「连接」建立 PTY 会话，输入内容会直接送往远端 shell。'
                        : '在右上角选择主机后即可建立交互式 SSH 会话。'
                    }
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </PageTransition>
    </div>
  )
}

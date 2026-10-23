import {
  ArrowBendDownRight,
  ArrowClockwise,
  Broom,
  CaretRight,
  Plus,
  Plugs,
  PlugsConnected,
  Terminal as TerminalIcon,
  X,
} from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useCommandRuns, useHosts, useKeys } from '@/api/queries'
import type { CommandRun, Host } from '@/api/types'
import { Chip, Dot, Pill, type Tone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { KeyValues } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { useTerminal, type TerminalStatus } from '@/hooks/use-terminal'
import { cn } from '@/lib/cn'
import { formatAgo, formatClock } from '@/lib/format'
import { spring, staggerItem } from '@/lib/motion'

const RECENT_KEY = 'onessh-terminal-recent'
const MAX_TABS = 5

/** 快捷命令全部是只读的，点一下直接回车执行 */
const QUICK = ['uptime', 'df -h', 'free -m', 'top -bn1 | head -15', 'ss -tlnp', 'systemctl --failed', 'journalctl -p err -n 20 --no-pager']

const STATUS: Record<TerminalStatus, { tone: Tone; label: string; live?: boolean }> = {
  idle: { tone: 'neutral', label: '未连接' },
  connecting: { tone: 'warn', label: '连接中…', live: true },
  connected: { tone: 'ok', label: '已连接', live: true },
  closed: { tone: 'neutral', label: '已断开' },
  error: { tone: 'bad', label: '连接失败' },
}

const RUN_TONE: Record<CommandRun['status'], Tone> = {
  running: 'warn',
  succeeded: 'ok',
  failed: 'warn',
  timeout: 'warn',
  lost: 'warn',
  cancelled: 'neutral',
}

function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, MAX_TABS) : []
  } catch {
    return []
  }
}

const hostTone = (host?: Host): Tone =>
  host?.health?.state === 'online' ? 'ok' : host?.health?.state === 'offline' ? 'bad' : 'neutral'

/** 终端顶部的主机标签：选中块是共享布局元素，切换主机时弹簧滑过去 */
function HostTabs({
  tabs,
  active,
  hostByName,
  onPick,
  onClose,
}: {
  tabs: string[]
  active?: string
  hostByName: Map<string, Host>
  onPick: (name: string) => void
  onClose: (name: string) => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
      {tabs.map((name) => {
        const on = name === active
        const host = hostByName.get(name)
        return (
          <div key={name} className="group/tab relative flex shrink-0 items-center">
            {on && (
              <motion.span
                layoutId="term-tab"
                className="absolute inset-0 rounded-ctl-in bg-white/[.07] shadow-[inset_0_1px_0_rgb(255_255_255/.05)]"
                transition={spring.snap}
              />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => !on && onPick(name)}
              className={cn(
                'relative z-[1] flex h-[30px] items-center gap-2 rounded-ctl-in pr-7 pl-3 font-mono text-[12px] transition-colors duration-150',
                on ? 'text-term-fg' : 'text-term-dim hover:text-term-fg',
              )}
            >
              <Dot tone={hostTone(host)} idle={!host} className="size-1.5" />
              {name}
            </button>
            <button
              type="button"
              aria-label={`关闭 ${name} 标签`}
              onClick={() => onClose(name)}
              className="absolute right-1.5 z-[1] grid size-[18px] place-items-center rounded-[5px] text-term-dim opacity-0 transition-[opacity,background-color,color] duration-150 group-hover/tab:opacity-100 hover:bg-white/10 hover:text-term-fg focus-visible:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** 主机选择菜单：「+」标签与空态都用它 */
function HostMenu({
  hosts,
  onPick,
  children,
}: {
  hosts: Host[]
  onPick: (name: string) => void
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuLabel>打开新会话</DropdownMenuLabel>
        {hosts.map((host) => (
          <DropdownMenuItem key={host.id} onSelect={() => onPick(host.name)} hint={host.tags[0]}>
            <Dot tone={hostTone(host)} idle={host.health?.state === 'unknown'} />
            <span className="truncate font-mono text-[12.5px]">{host.name}</span>
          </DropdownMenuItem>
        ))}
        {hosts.length === 0 && <p className="px-2.5 py-2 text-[12.5px] text-ink-3">还没有主机</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TerminalPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const hostParam = params.get('host') ?? undefined
  const { data: hosts = [], isLoading } = useHosts()
  const { data: keys = [] } = useKeys()
  const { mountRef, status, size, host: sessionHost, connectedAt, connect, disconnect, send, clear } = useTerminal()
  const [recent, setRecent] = useState<string[]>(readRecent)

  const hostByName = useMemo(() => new Map(hosts.map((h) => [h.name, h])), [hosts])
  const current = hostParam ? hostByName.get(hostParam) : undefined
  const jump = current?.jump_host_id ? hosts.find((h) => h.id === current.jump_host_id) : undefined
  const runs = useCommandRuns({ host: hostParam ? [hostParam] : [], limit: 6 }, !!hostParam)

  const remember = useCallback((name: string) => {
    setRecent((prev) => {
      const next = [name, ...prev.filter((n) => n !== name)].slice(0, MAX_TABS)
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // 主机由 URL 决定（命令面板、主机详情都链到 /terminal?host=xxx）：参数一变就建立新会话
  useEffect(() => {
    if (!hostParam) return
    remember(hostParam)
    void connect(hostParam)
  }, [hostParam, connect, remember])

  const pick = (name: string) => setParams({ host: name }, { replace: true })

  const closeTab = (name: string) => {
    const next = recent.filter((n) => n !== name)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    if (name === hostParam) {
      disconnect()
      if (next[0]) pick(next[0])
      else setParams({}, { replace: true })
    }
  }

  const runQuick = (cmd: string) => {
    if (!send(`${cmd}\r`)) toast.info('先连接一台主机', { description: '快捷命令会直接输入到当前会话。' })
  }

  // 标签：最近打开的主机，当前主机始终在列（即使它刚从命令面板跳进来）
  const tabs = hostParam && !recent.includes(hostParam) ? [hostParam, ...recent].slice(0, MAX_TABS) : recent
  const state = STATUS[status]
  const showPicker = !hostParam

  return (
    <PageTransition>
      <PageHeader
        title="终端"
        description="浏览器里的 SSH 会话同样经过网关：私钥与密码只在网关解密，不会落到浏览器。"
        actions={
          <>
            <Button onClick={clear} disabled={status !== 'connected'}>
              <Broom />
              清屏
            </Button>
            {status === 'connected' || status === 'connecting' ? (
              <Button onClick={disconnect}>
                <Plugs />
                {status === 'connecting' ? '取消' : '断开'}
              </Button>
            ) : (
              <Button variant="primary" disabled={!hostParam} onClick={() => hostParam && void connect(hostParam)}>
                <PlugsConnected />
                {status === 'idle' ? '连接' : '重新连接'}
              </Button>
            )}
          </>
        }
      />

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <motion.section
          variants={staggerItem}
          aria-label="终端会话"
          className="min-w-0 rounded-card bg-term-bg p-1.5 text-term-fg shadow-[0_0_0_1px_rgb(0_0_0/.5),inset_0_1px_0_rgb(255_255_255/.06),0_20px_50px_-20px_rgb(0_0_0/.45)]"
        >
          <div className="flex h-[38px] items-center gap-1 pr-1.5 pb-1.5 pl-1">
            <HostTabs tabs={tabs} active={hostParam} hostByName={hostByName} onPick={pick} onClose={closeTab} />
            <HostMenu hosts={hosts} onPick={pick}>
              <button
                type="button"
                aria-label="打开新会话"
                className="grid size-[30px] shrink-0 place-items-center rounded-ctl-in text-term-dim transition-colors hover:bg-white/[.07] hover:text-term-fg"
              >
                <Plus size={14} />
              </button>
            </HostMenu>
            <div className="ml-auto flex shrink-0 items-center gap-2 pl-3 font-mono text-[11.5px] whitespace-nowrap text-term-dim" aria-live="polite">
              <Dot tone={state.tone} live={state.live} />
              <span>{state.label}</span>
              {status === 'connected' && jump && (
                <span className="hidden items-center gap-1 sm:inline-flex">
                  · <ArrowBendDownRight size={12} /> {jump.name}
                </span>
              )}
              {status === 'connected' && size && <span className="hidden md:inline">· {size.cols}×{size.rows}</span>}
            </div>
          </div>

          <div className="relative h-[clamp(360px,calc(100dvh-250px),720px)] overflow-hidden rounded-well bg-term-screen shadow-[inset_0_0_0_1px_rgb(255_255_255/.04)]">
            <div ref={mountRef} className="absolute inset-0 px-3 py-2.5" />

            {showPicker && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-term-screen px-6 text-center">
                <div className="mb-2 grid size-11 place-items-center rounded-[13px] bg-white/[.06] text-term-dim shadow-[inset_0_0_0_1px_rgb(255_255_255/.05)]">
                  <TerminalIcon size={20} />
                </div>
                <h2 className="text-[14px] font-semibold text-term-fg">选择一台主机开始会话</h2>
                <p className="max-w-[44ch] text-[12.5px] leading-relaxed text-term-dim">
                  会话经网关建立 PTY，跳板链对你透明；输入会直接送往远端 shell。
                </p>
                {isLoading ? (
                  <Skeleton className="mt-4 h-8 w-64 bg-white/[.06]" />
                ) : (
                  <div className="mt-4 flex max-w-xl flex-wrap justify-center gap-1.5">
                    {hosts.slice(0, 12).map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => pick(h.name)}
                        className="inline-flex h-7 items-center gap-2 rounded-full bg-white/[.06] px-3 font-mono text-[12px] text-term-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/.06)] transition-[background-color,transform] duration-150 hover:bg-white/[.11] active:scale-[0.96]"
                      >
                        <Dot tone={hostTone(h)} idle={h.health?.state === 'unknown'} className="size-1.5" />
                        {h.name}
                      </button>
                    ))}
                    {hosts.length === 0 && (
                      <Button size="sm" onClick={() => navigate('/hosts?new=1')}>
                        添加主机
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!showPicker && (status === 'closed' || status === 'error') && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.soft}
                className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#1f1f1d] py-1.5 pr-1.5 pl-4 text-[12.5px] shadow-[0_0_0_1px_rgb(255_255_255/.08),0_10px_30px_-8px_rgb(0_0_0/.6)]"
              >
                <Dot tone={status === 'error' ? 'bad' : 'neutral'} />
                <span className="whitespace-nowrap text-term-fg">
                  {status === 'error' ? `无法连接 ${sessionHost ?? hostParam}` : '会话已结束'}
                </span>
                <button
                  type="button"
                  onClick={() => hostParam && void connect(hostParam)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-term-fg px-3 font-medium text-term-bg transition-transform duration-150 active:scale-[0.96]"
                >
                  <ArrowClockwise size={13} weight="bold" />
                  重新连接
                </button>
              </motion.div>
            )}
          </div>
        </motion.section>

        <div className="flex flex-col gap-3">
          <motion.div variants={staggerItem}>
            <Card>
              <CardHeader
                title="会话"
                actions={
                  <Pill tone={state.tone} dot live={state.live}>
                    {state.label}
                  </Pill>
                }
              />
              {current ? (
                <KeyValues
                  className="px-3.5 pb-3.5"
                  items={[
                    { label: '主机', value: current.name, mono: true },
                    { label: '用户', value: current.username, mono: true },
                    {
                      label: '路由',
                      value: jump ? (
                        <>
                          经 <span className="font-mono text-[12px]">{jump.name}</span>
                        </>
                      ) : (
                        '直连'
                      ),
                    },
                    {
                      label: '认证',
                      value:
                        current.auth_type === 'key' ? (
                          <span className="font-mono text-[12px]">{keys.find((k) => k.id === current.key_id)?.name ?? '密钥'}</span>
                        ) : (
                          '密码'
                        ),
                    },
                    {
                      label: '指纹',
                      value: current.hostkey_fp ? (
                        <Tooltip content={<span className="font-mono">{current.hostkey_fp}</span>}>
                          <span className="font-mono text-[12px]">{current.hostkey_fp.slice(0, 22)}…</span>
                        </Tooltip>
                      ) : (
                        <span className="text-ink-3">首次连接时记录</span>
                      ),
                    },
                    { label: '开始于', value: connectedAt ? formatClock(connectedAt) : '—', mono: true },
                    { label: '尺寸', value: size && status === 'connected' ? `${size.cols} × ${size.rows}` : '—', mono: true },
                  ]}
                />
              ) : (
                <p className="px-3.5 pb-4 text-[12.5px] leading-relaxed text-ink-2">
                  {hostParam ? `主机 ${hostParam} 不存在或已被删除。` : '还没有打开会话。从左侧选一台主机，或按 ⌘K 搜索。'}
                </p>
              )}
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card>
              <CardHeader title="快捷命令" actions={<span className="text-[12px] text-ink-3">点击即执行</span>} />
              <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                {QUICK.map((cmd) => (
                  <Chip key={cmd} mono disabled={status !== 'connected'} onClick={() => runQuick(cmd)} className="disabled:opacity-45">
                    {cmd}
                  </Chip>
                ))}
              </div>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card>
              <CardHeader title="Agent 最近在这台主机上" />
              <div className="px-1.5 pb-1.5">
                {!hostParam ? (
                  <p className="px-2 pt-0.5 pb-3 text-[12.5px] text-ink-3">打开会话后显示 Agent 在该主机上的最近命令。</p>
                ) : runs.isLoading ? (
                  <div className="space-y-1.5 px-2 pb-2">
                    {Array.from({ length: 3 }, (_, i) => (
                      <Skeleton key={i} className="h-5" />
                    ))}
                  </div>
                ) : (runs.data ?? []).length === 0 ? (
                  <p className="px-2 pt-0.5 pb-3 text-[12.5px] text-ink-3">暂无记录。</p>
                ) : (
                  (runs.data ?? []).map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => navigate(`/activity/${run.id}`)}
                      className="group/run grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors duration-150 hover:bg-hover-2"
                    >
                      <Dot tone={RUN_TONE[run.status]} live={run.status === 'running'} />
                      <span className="truncate font-mono text-[12px]" title={run.command}>
                        {run.command}
                      </span>
                      <span className="flex items-center gap-1 font-mono text-[11.5px] text-ink-3">
                        {run.status === 'running' ? '运行中' : formatAgo(run.started_at)}
                        <CaretRight size={11} className="opacity-0 transition-opacity group-hover/run:opacity-100" />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  )
}

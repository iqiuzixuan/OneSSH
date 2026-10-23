import { Desktop, MagnifyingGlass, Moon, SidebarSimple, SignOut, Sun } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useLive } from '@/api/live'
import { useHosts, useInfo, useJobs, useTokens } from '@/api/queries'
import { LogoTile } from '@/components/brand/logo'
import { Dot } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { formatUptime } from '@/lib/format'
import { spring } from '@/lib/motion'
import { useTheme, type ThemeMode } from '@/lib/theme'
import { navGroups } from './nav-items'
import { useLogout } from './use-logout'

const isActivePath = (pathname: string, to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))

/** 监听在本机 / 全部网卡时只显示端口，地址本身没有信息量 */
const shortListen = (listen: string) => listen.replace(/^(0\.0\.0\.0|127\.0\.0\.1|localhost|\[::\]|\[::1\])?(?=:\d+$)/, '')

/** 每分钟刷新一次的「现在」，用于运行时长这类粗粒度相对时间 */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** 导航项右侧的等宽小字：主机在线数、令牌数、运行中任务、实时流状态 */
function useNavMeta() {
  const { data: hosts = [] } = useHosts()
  const { data: tokens = [] } = useTokens()
  const { data: jobs = [] } = useJobs({ live: false })
  const { status } = useLive()
  const online = hosts.filter((host) => host.health?.state === 'online').length
  const running = jobs.filter((job) => job.job.status === 'running').length
  return {
    '/hosts': hosts.length ? <span className="tabular-nums">{online}/{hosts.length}</span> : null,
    '/tokens': tokens.length ? <span className="tabular-nums">{tokens.length}</span> : null,
    '/jobs': running ? (
      <>
        <Dot tone="warn" className="size-1.5" />
        <span className="tabular-nums">{running}</span>
      </>
    ) : null,
    '/activity': status === 'open' ? <Dot tone="ok" live className="size-1.5" label="实时连接正常" /> : null,
  } as Record<string, React.ReactNode>
}

const themeOptions: { value: ThemeMode; label: React.ReactNode; title: string }[] = [
  { value: 'light', label: <Sun />, title: '浅色' },
  { value: 'dark', label: <Moon />, title: '深色' },
  { value: 'system', label: <Desktop />, title: '跟随系统' },
]

/**
 * 侧边栏：232px，可折叠成 64px 图标栏。分组导航的选中项底下是一个共享布局的高亮块，
 * 切页时弹簧滑到新位置；底部是网关状态（实时流是否连通、运行时长）与明暗切换。
 */
export function Sidebar({
  collapsed,
  onToggle,
  onOpenPalette,
  onNavigate,
}: {
  collapsed: boolean
  onToggle?: () => void
  onOpenPalette: () => void
  onNavigate?: () => void
}) {
  const { pathname } = useLocation()
  const meta = useNavMeta()
  const { data: info } = useInfo()
  const { status } = useLive()
  const { mode, setMode } = useTheme()
  const now = useMinuteClock()

  const fade = cn('transition-opacity duration-200', collapsed && 'pointer-events-none opacity-0')
  const logout = useLogout()
  // 退出是低频但要找得到的动作：放在主题切换旁，悬停才转红，平时不抢眼
  const logoutButton = (
    <Tooltip content="退出登录" side={collapsed ? 'right' : 'top'}>
      <button
        type="button"
        aria-label="退出登录"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
        className="grid size-8 shrink-0 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-bad-soft hover:text-bad disabled:opacity-50 [&_svg]:size-4"
      >
        {logout.isPending ? <Spinner className="size-3.5" /> : <SignOut />}
      </button>
    </Tooltip>
  )

  return (
    <div className="flex h-full flex-col gap-3.5 overflow-hidden px-2.5 pt-3.5 pb-3">
      <div className="relative flex h-8 items-center gap-2.5 px-1.5 whitespace-nowrap">
        <LogoTile className="size-[26px]" />
        <b className={cn('text-[14.5px] tracking-[-0.015em]', fade)}>OneSSH</b>
        {info?.version && <span className={cn('pt-0.5 font-mono text-[10.5px] text-ink-3', fade)}>{info.version}</span>}
        {onToggle && (
          <Tooltip content={collapsed ? '展开侧边栏' : '收起侧边栏'} side="right">
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
              className={cn(
                'grid size-7 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink',
                collapsed ? 'absolute top-[52px] left-[11px]' : 'ml-auto',
              )}
            >
              <SidebarSimple size={16} />
            </button>
          </Tooltip>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className={cn(
          'flex h-8 items-center gap-2 rounded-ctl bg-surface pr-2 pl-2.5 whitespace-nowrap text-ink-3 shadow-ctl',
          'transition-[box-shadow,color,transform] duration-150 hover:text-ink-2 active:scale-[0.98]',
          collapsed && 'mt-[30px] w-11 justify-center px-0',
        )}
        aria-label="搜索或跳转（⌘K）"
      >
        <MagnifyingGlass size={15} className="shrink-0" />
        {!collapsed && (
          <>
            <span className="text-[13px]">搜索或跳转…</span>
            <Kbd className="ml-auto">⌘K</Kbd>
          </>
        )}
      </button>

      {/* 滚动容器会裁掉贴边元素的外阴影：选中项的 1px 环与投影向外伸 2–3px，四周各留 4px 再用负边距抵消，布局不动 */}
      <nav aria-label="主导航" className="-mx-1 -my-1 flex min-h-0 flex-col gap-px overflow-x-hidden overflow-y-auto px-1 py-1">
        {navGroups.map((group, gi) => (
          <div key={group.title ?? gi} className="flex flex-col gap-px">
            {group.title && (
              <p className={cn('mt-3.5 mb-1 h-[18px] px-2.5 text-[11.5px] whitespace-nowrap text-ink-3', fade)}>{group.title}</p>
            )}
            {group.items.map(({ to, label, icon: Icon }) => {
              const active = isActivePath(pathname, to)
              const link = (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={onNavigate}
                  aria-label={collapsed ? label : undefined}
                  className={cn(
                    'group/nav relative flex h-8 items-center gap-2.5 rounded-[9px] whitespace-nowrap transition-colors duration-150',
                    collapsed ? 'px-[13px]' : 'px-2.5',
                    active ? 'font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink',
                  )}
                >
                  {active && (
                    <motion.span layoutId="nav-ind" className="absolute inset-0 rounded-[9px] bg-surface shadow-seg" transition={spring.snap} />
                  )}
                  <Icon size={17} weight={active ? 'fill' : 'regular'} className="relative z-[1] shrink-0 transition-transform duration-200 group-active/nav:scale-90" />
                  <span className={cn('relative z-[1]', fade)}>{label}</span>
                  {meta[to] && (
                    <span className={cn('relative z-[1] ml-auto flex items-center gap-1.5 font-mono text-[11px] font-medium text-ink-3', fade)}>
                      {meta[to]}
                    </span>
                  )}
                </NavLink>
              )
              return collapsed ? (
                <Tooltip key={to} content={label} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-[12px] whitespace-nowrap',
            collapsed ? 'justify-center py-2.5' : 'bg-bg-sunk p-2.5 shadow-well',
          )}
          title={status === 'open' ? '实时事件流已连接' : '实时事件流重连中'}
        >
          <Dot tone={status === 'open' ? 'ok' : status === 'error' ? 'bad' : 'warn'} live={status === 'open'} />
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[12px] font-medium">{status === 'open' ? '网关运行中' : status === 'error' ? '实时连接已断开' : '正在连接…'}</div>
              <div className="truncate font-mono text-[11px] text-ink-3">
                {info ? `${shortListen(info.listen)} · 已运行 ${formatUptime(now - info.started_at)}` : '—'}
              </div>
            </div>
          )}
        </div>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            {/* 图标栏放不下分段控件：一个按钮按 浅色 → 深色 → 跟随系统 循环 */}
            <Tooltip content={`主题：${themeOptions.find((o) => o.value === mode)?.title}（点击切换）`} side="right">
              <button
                type="button"
                aria-label="切换主题"
                onClick={() => setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light')}
                className="grid size-8 place-items-center rounded-[9px] text-ink-2 transition-colors hover:bg-hover-2 hover:text-ink [&_svg]:size-4"
              >
                {themeOptions.find((o) => o.value === mode)?.label}
              </button>
            </Tooltip>
            {logoutButton}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Segmented value={mode} onChange={setMode} options={themeOptions} size="sm" aria-label="主题" />
            {logoutButton}
          </div>
        )}
      </div>
    </div>
  )
}

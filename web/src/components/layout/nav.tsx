import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { LogoTile } from '@/components/brand/logo'
import { navGroups, navItems } from './nav-items'

const isActivePath = (pathname: string, to: string) =>
  to === '/' ? pathname === '/' : pathname.startsWith(to)

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoTile className="size-8" />
      <span className="text-[15px] font-semibold tracking-tight text-text">OneSSH</span>
    </span>
  )
}

/**
 * 桌面顶部标签页：纯文字胶囊，激活态用 accent 浅底 + 重字。
 * 条目较多，容器允许横向滚动并隐藏滚动条，窄屏不挤压右侧操作区。
 */
export function TopTabs() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="主导航"
      className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {navItems.map(({ to, label }) => {
        const isActive = isActivePath(pathname, to)
        return (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={cn(
              'flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors duration-150',
              isActive
                ? 'bg-accent-soft font-semibold text-accent-ink'
                : 'text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            {label}
          </NavLink>
        )
      })}
    </nav>
  )
}

/** 移动端抽屉导航：保留分组结构，与顶部标签页共用同一份导航数据 */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  return (
    <nav className="flex flex-col gap-6 px-3">
      {navGroups.map((group, gi) => (
        <div key={group.title ?? `group-${gi}`} className="space-y-0.5">
          {group.title && (
            <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
              {group.title}
            </p>
          )}
          {group.items.map(({ to, label, icon: Icon }) => {
            const isActive = isActivePath(pathname, to)
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={onNavigate}
                className={cn(
                  'flex h-10 items-center gap-2.5 rounded-control px-2.5 text-[13px] font-medium transition-colors duration-150',
                  isActive ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface-2 hover:text-text',
                )}
              >
                <Icon size={17} weight={isActive ? 'fill' : 'regular'} />
                {label}
              </NavLink>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

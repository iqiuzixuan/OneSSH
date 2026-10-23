import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { LiveProvider } from '@/api/live'
import { useHosts } from '@/api/queries'
import { LogoTile } from '@/components/brand/logo'
import { CommandPalette } from '@/components/command-palette'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/cn'
import { Sidebar } from './nav'

const COLLAPSE_KEY = 'onessh-sidebar-collapsed'
const NARROW_QUERY = '(max-width: 960px)'

function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW_QUERY).matches)
  useEffect(() => {
    const mql = matchMedia(NARROW_QUERY)
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return narrow
}

/**
 * 外壳：左侧 232px 侧边栏（可折叠为 64px 图标栏，窄屏强制图标栏）+ 内容区。
 * 内容区最大宽 1240 居中。实时事件流（LiveProvider）在这里挂载——登录之后才连。
 */
export function AppShell() {
  const hosts = useHosts()
  const narrow = useNarrow()
  const [collapsedPref, setCollapsedPref] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const collapsed = narrow || collapsedPref

  // ⌘K / Ctrl+K 全局唤起命令面板
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const toggle = () => {
    setCollapsedPref((prev) => {
      localStorage.setItem(COLLAPSE_KEY, prev ? '0' : '1')
      return !prev
    })
  }

  // 首次拉取 /hosts 兼作鉴权探针：401 会由 client 广播事件，AuthGuard 负责跳转
  if (hosts.isLoading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg">
        <LogoTile className="size-10" />
        <Spinner className="text-ink-3" />
      </div>
    )
  }

  return (
    <LiveProvider>
      <div
        className={cn(
          'grid min-h-dvh bg-bg transition-[grid-template-columns] duration-[420ms] ease-[var(--ease-out)]',
          collapsed ? 'grid-cols-[64px_minmax(0,1fr)]' : 'grid-cols-[232px_minmax(0,1fr)]',
        )}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-primary-fg"
        >
          跳到主内容
        </a>
        <aside className="sticky top-0 h-dvh">
          <Sidebar collapsed={collapsed} onToggle={narrow ? undefined : toggle} onOpenPalette={() => setPaletteOpen(true)} />
        </aside>
        <main id="main" className="min-w-0 px-[18px] pt-[26px] pb-24 md:px-10">
          <div className="mx-auto max-w-[1240px]">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </LiveProvider>
  )
}

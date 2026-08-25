import { Check, Desktop, HardDrives, List, Moon, Plus, Sun } from '@phosphor-icons/react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'
import { ACCENT_META, useTheme, type AccentName, type ThemeMode } from '@/lib/theme'
import { Brand, TopTabs } from './nav'

const modes: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: '浅色', icon: <Sun size={15} /> },
  { value: 'dark', label: '深色', icon: <Moon size={15} /> },
  { value: 'system', label: '跟随系统', icon: <Desktop size={15} /> },
]

export function Topbar({
  hostCount,
  onOpenNav,
  onOpenPalette,
}: {
  hostCount: number
  onOpenNav: () => void
  onOpenPalette: () => void
}) {
  const navigate = useNavigate()
  const { mode, resolved, setMode, accent, setAccent } = useTheme()
  const current =
    mode === 'system' ? <Desktop size={16} /> : resolved === 'dark' ? <Moon size={16} /> : <Sun size={16} />

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-bg/80 backdrop-blur-[10px]">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 md:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 lg:hidden"
          onClick={onOpenNav}
          aria-label="打开导航"
        >
          <List size={18} />
        </Button>
        <Link to="/" aria-label="OneSSH 概览" className="shrink-0">
          <Brand />
        </Link>
        {/* 桌面标签页吃满中间剩余空间；移动端隐藏，导航走抽屉 */}
        <div className="hidden min-w-0 flex-1 lg:flex">
          <TopTabs />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          <button
            type="button"
            onClick={onOpenPalette}
            className="mr-1 hidden h-8 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-[12px] text-faint transition-colors hover:border-accent hover:text-muted lg:inline-flex"
          >
            <kbd className="rounded-[5px] border border-border bg-surface-2 px-1 font-mono text-[10px] font-semibold">
              ⌘K
            </kbd>
            搜索 / 执行命令…
          </button>
          <Button
            variant="primary"
            size="sm"
            className="mr-1 hidden md:inline-flex"
            onClick={() => navigate('/hosts?new=1')}
          >
            <Plus size={14} weight="bold" />
            新建主机
          </Button>
          <Link
            to="/hosts"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <HardDrives size={14} />
            <span className="tabular-nums">{hostCount}</span>
            <span className="hidden sm:inline">台主机</span>
          </Link>
          {/* 主题模式与主题色收进同一个菜单：模式是列表项，主题色是一排色板 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="切换主题">
                {current}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {modes.map((m) => (
                <DropdownMenuItem key={m.value} onSelect={() => setMode(m.value)}>
                  {m.icon}
                  <span className="flex-1">{m.label}</span>
                  {mode === m.value && <Check size={14} className="text-accent" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>主题色</DropdownMenuLabel>
              {/* 普通 div 而非菜单项：点色板不关闭菜单，方便连续试色；选中态用外圈描边 */}
              <div className="flex items-center gap-2 px-2.5 pt-0.5 pb-1.5" role="radiogroup" aria-label="主题色">
                {(Object.keys(ACCENT_META) as AccentName[]).map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={accent === name}
                    aria-label={`主题色：${ACCENT_META[name].label}`}
                    title={ACCENT_META[name].label}
                    onClick={() => setAccent(name)}
                    style={{ background: ACCENT_META[name].swatch }}
                    className={cn(
                      'size-[18px] rounded-full border-2 border-surface shadow-[0_0_0_1px_var(--border-strong)] transition-transform hover:scale-125',
                      accent === name && 'shadow-[0_0_0_2px_var(--text)]',
                    )}
                  />
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

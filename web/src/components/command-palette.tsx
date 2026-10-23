import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Desktop,
  FolderOpen,
  HardDrives,
  MagnifyingGlass,
  Moon,
  Plus,
  SignOut,
  Sun,
  Terminal,
  Ticket,
} from '@phosphor-icons/react'
import { Command, useCommandState } from 'cmdk'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHosts } from '@/api/queries'
import { navItems } from '@/components/layout/nav-items'
import { Scrim } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { useTheme } from '@/lib/theme'
import { useLogout } from '@/components/layout/use-logout'

type Entry = {
  value: string
  label: string
  hint?: string
  keywords?: string[]
  icon: React.ReactNode
  run: () => void
}

/** 选中项底下的高亮块是共享布局元素：上下移动时弹簧滑过去，而不是逐项闪烁 */
function Item({ entry, onRun }: { entry: Entry; onRun: (entry: Entry) => void }) {
  const selected = useCommandState((state) => state.value === entry.value)
  return (
    <Command.Item
      value={entry.value}
      keywords={entry.keywords}
      onSelect={() => onRun(entry)}
      className={cn(
        'relative flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 text-[13.5px] outline-none select-none',
        selected ? 'text-ink' : 'text-ink-2',
      )}
    >
      {selected && (
        <motion.span layoutId="cmdk-ind" className="absolute inset-0 rounded-[12px] bg-well-2" transition={spring.snap} />
      )}
      <span className={cn('relative z-[1] grid w-[18px] place-items-center [&_svg]:size-4', selected ? 'text-ink' : 'text-ink-3')}>
        {entry.icon}
      </span>
      <span className="relative z-[1] truncate">{entry.label}</span>
      {entry.hint && <span className="relative z-[1] ml-auto shrink-0 font-mono text-[11.5px] text-ink-3">{entry.hint}</span>}
    </Command.Item>
  )
}

function Group({ heading, entries, onRun }: { heading: string; entries: Entry[]; onRun: (entry: Entry) => void }) {
  if (entries.length === 0) return null
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:text-ink-3"
    >
      {entries.map((entry) => (
        <Item key={entry.value} entry={entry} onRun={onRun} />
      ))}
    </Command.Group>
  )
}

/**
 * ⌘K 命令面板（cmdk）：页面跳转、常用操作、按主机直达详情 / 终端 / 文件、主题切换。
 * cmdk 负责模糊匹配与 ↑↓ / ↵ 键盘交互，Radix Dialog 负责焦点圈定与 Esc。
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const { setMode } = useTheme()
  const logout = useLogout()
  const { data: hosts = [] } = useHosts()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  const go = (to: string) => () => navigate(to)
  const pages: Entry[] = navItems.map(({ to, label, icon: Icon }) => ({
    value: `page:${to}`,
    label,
    hint: to,
    icon: <Icon />,
    run: go(to),
  }))
  const actions: Entry[] = [
    { value: 'action:new-token', label: '签发令牌', keywords: ['token', 'new', '创建'], icon: <Ticket />, run: go('/tokens/new') },
    { value: 'action:new-host', label: '添加主机', keywords: ['host', 'new', '新建'], icon: <Plus />, run: go('/hosts?new=1') },
  ]
  const hostEntries: Entry[] = hosts.flatMap((host) => [
    {
      value: `host:${host.id}`,
      label: host.name,
      hint: `${host.username}@${host.addr}`,
      keywords: host.tags,
      icon: <HardDrives />,
      run: go(`/hosts/${host.id}`),
    },
    {
      value: `term:${host.id}`,
      label: `在终端中打开 ${host.name}`,
      keywords: ['terminal', 'ssh', ...host.tags],
      icon: <Terminal />,
      run: go(`/terminal?host=${encodeURIComponent(host.name)}`),
    },
    {
      value: `files:${host.id}`,
      label: `浏览 ${host.name} 的文件`,
      keywords: ['files', 'sftp', ...host.tags],
      icon: <FolderOpen />,
      run: go(`/files?host=${host.id}`),
    },
  ])
  const themes: Entry[] = [
    { value: 'theme:light', label: '浅色主题', keywords: ['light', 'theme'], icon: <Sun />, run: () => setMode('light') },
    { value: 'theme:dark', label: '深色主题', keywords: ['dark', 'theme'], icon: <Moon />, run: () => setMode('dark') },
    { value: 'theme:system', label: '跟随系统', keywords: ['system', 'theme'], icon: <Desktop />, run: () => setMode('system') },
  ]
  const account: Entry[] = [
    { value: 'account:logout', label: '退出登录', keywords: ['logout', 'sign out', '登出', '注销'], icon: <SignOut />, run: () => logout.mutate() },
  ]

  const run = (entry: Entry) => {
    onOpenChange(false)
    entry.run()
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <Scrim />
            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed top-[14vh] left-1/2 z-[81] w-[min(620px,calc(100vw-32px))] origin-top rounded-[18px] bg-surface p-1.5 shadow-pop outline-none"
                style={{ x: '-50%' }}
                initial={{ opacity: 0, scale: 0.97, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: spring.soft }}
                exit={{ opacity: 0, scale: 0.98, y: -4, transition: spring.exit }}
              >
                <DialogPrimitive.Title className="sr-only">命令面板</DialogPrimitive.Title>
                <Command label="命令面板" loop className="flex max-h-[66vh] flex-col">
                  <div className="flex h-[46px] items-center gap-2.5 px-3 text-ink-3">
                    <MagnifyingGlass size={18} />
                    <Command.Input
                      autoFocus
                      value={search}
                      onValueChange={setSearch}
                      placeholder="搜索主机、页面或操作…"
                      className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
                    />
                    <Kbd>esc</Kbd>
                  </div>
                  <Command.List className="-mx-1.5 min-h-0 flex-1 overflow-y-auto border-t border-line px-1.5 pt-1 pb-0.5">
                    <Command.Empty className="py-9 text-center text-[13px] text-ink-3">
                      没有匹配「{search}」的结果
                    </Command.Empty>
                    <Group heading="操作" entries={actions} onRun={run} />
                    <Group heading="页面" entries={pages} onRun={run} />
                    <Group heading="主机" entries={hostEntries} onRun={run} />
                    <Group heading="外观" entries={themes} onRun={run} />
                    <Group heading="账户" entries={account} onRun={run} />
                  </Command.List>
                  <div className="mt-0.5 flex items-center gap-3.5 border-t border-line px-2.5 pt-2.5 pb-1 text-[11.5px] text-ink-3">
                    <span>
                      <Kbd className="mr-1">↑↓</Kbd>选择
                    </span>
                    <span>
                      <Kbd className="mr-1">↵</Kbd>打开
                    </span>
                    <span className="ml-auto">
                      <Kbd className="mr-1">⌘K</Kbd>随时唤起
                    </span>
                  </div>
                </Command>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

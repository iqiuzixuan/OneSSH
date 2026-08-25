import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHosts } from '@/api/queries'
import { navItems } from '@/components/layout/nav-items'
import { cn } from '@/lib/cn'
import { overlayTransition, popTransition } from '@/lib/motion'
import { ACCENT_META, useTheme, type AccentName } from '@/lib/theme'

type PaletteItem = {
  id: string
  group: string
  label: string
  /** 右侧的等宽小字提示（路径、快捷键语义等） */
  hint?: string
  icon?: React.ReactNode
  run: () => void
}

/**
 * ⌘K 命令面板：页面跳转 + 常用操作 + 主题/主题色切换 + 按主机直达终端/文件。
 * 键盘：↑↓ 选择、↵ 执行、esc 关闭（esc 与焦点管理由 Radix Dialog 承担）。
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { setMode, setAccent } = useTheme()
  const { data: hosts = [] } = useHosts()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const items = useMemo<PaletteItem[]>(() => {
    const go = (to: string) => () => navigate(to)
    return [
      ...navItems.map(({ to, label, icon: Icon }) => ({
        id: `nav-${to}`,
        group: '页面',
        label,
        hint: to,
        icon: <Icon size={15} />,
        run: go(to),
      })),
      { id: 'new-host', group: '操作', label: '新建主机', run: go('/hosts?new=1') },
      { id: 'new-token', group: '操作', label: '创建令牌', run: go('/tokens?new=1') },
      { id: 'mode-light', group: '主题', label: '浅色模式', run: () => setMode('light') },
      { id: 'mode-dark', group: '主题', label: '深色模式', run: () => setMode('dark') },
      { id: 'mode-system', group: '主题', label: '跟随系统', run: () => setMode('system') },
      ...(Object.keys(ACCENT_META) as AccentName[]).map((name) => ({
        id: `accent-${name}`,
        group: '主题色',
        label: `主题色：${ACCENT_META[name].label}`,
        icon: (
          <span
            aria-hidden
            className="inline-block size-3 rounded-full"
            style={{ background: ACCENT_META[name].swatch }}
          />
        ),
        run: () => setAccent(name),
      })),
      ...hosts.flatMap((host): PaletteItem[] => [
        {
          id: `term-${host.id}`,
          group: '主机',
          label: `终端 → ${host.name}`,
          run: go(`/terminal?host=${encodeURIComponent(host.name)}`),
        },
        {
          id: `files-${host.id}`,
          group: '主机',
          label: `文件 → ${host.name}`,
          run: go(`/files?host=${host.id}`),
        },
      ]),
    ]
  }, [navigate, setMode, setAccent, hosts])

  const needle = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      needle
        ? items.filter((item) => `${item.group} ${item.label}`.toLowerCase().includes(needle))
        : items,
    [items, needle],
  )

  // 每次打开回到初始态；过滤结果变化时高亮项收敛到范围内
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])
  useEffect(() => {
    setActive((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // 键盘移动后让高亮项保持在可视区
  useEffect(() => {
    document
      .querySelector('[data-palette-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (item: PaletteItem) => {
    onOpenChange(false)
    item.run()
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={overlayTransition}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                className="fixed inset-x-0 top-[16vh] z-50 mx-auto flex max-h-[70dvh] w-[calc(100vw-2rem)] max-w-[580px] flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-pop focus:outline-none"
                initial={{ opacity: 0, scale: 0.97, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -8 }}
                transition={popTransition}
              >
                <DialogPrimitive.Title className="sr-only">命令面板</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  跳转页面或执行命令
                </DialogPrimitive.Description>

                <div className="flex items-center gap-2.5 border-b border-border px-4.5 py-3.5">
                  <span aria-hidden className="font-mono font-bold text-accent-ink">
                    &gt;
                  </span>
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- 面板打开即输入是唯一用途
                    autoFocus
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setActive(0)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault()
                        setActive((prev) => Math.min(prev + 1, filtered.length - 1))
                      } else if (event.key === 'ArrowUp') {
                        event.preventDefault()
                        setActive((prev) => Math.max(prev - 1, 0))
                      } else if (event.key === 'Enter' && filtered[active]) {
                        event.preventDefault()
                        run(filtered[active])
                      }
                    }}
                    placeholder="跳转页面或执行命令…"
                    spellCheck={false}
                    className="flex-1 bg-transparent text-[13.5px] text-text outline-none placeholder:text-faint"
                  />
                </div>

                <ul className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox">
                  {filtered.length === 0 && (
                    <li className="px-3 py-8 text-center text-[12px] text-muted">
                      没有匹配「{query}」的命令
                    </li>
                  )}
                  {filtered.map((item, index) => {
                    const showGroup = index === 0 || filtered[index - 1].group !== item.group
                    return (
                      <li key={item.id}>
                        {showGroup && (
                          <p className="px-3 pt-2 pb-1 text-[10.5px] font-medium tracking-[0.1em] text-faint uppercase first:pt-0">
                            {item.group}
                          </p>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === active}
                          data-palette-active={index === active || undefined}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => run(item)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-[13px] transition-colors',
                            index === active ? 'bg-accent-soft text-text' : 'text-muted',
                          )}
                        >
                          {item.icon && (
                            <span className={cn('shrink-0', index === active ? 'text-accent-ink' : 'text-faint')}>
                              {item.icon}
                            </span>
                          )}
                          <span className="truncate">{item.label}</span>
                          {item.hint && (
                            <kbd className="ml-auto shrink-0 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-faint">
                              {item.hint}
                            </kbd>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <div className="flex gap-4 border-t border-border bg-surface-2 px-4.5 py-2 text-[10.5px] text-faint">
                  <span>↑↓ 选择</span>
                  <span>↵ 执行</span>
                  <span>esc 关闭</span>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

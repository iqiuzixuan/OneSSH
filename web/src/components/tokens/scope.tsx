import { Check, Eye, Info, MagnifyingGlass, Warning } from '@phosphor-icons/react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { Host, Token, ToolGroup } from '@/api/types'
import { Chip, Dot } from '@/components/ui/badge'
import { Well } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Num } from '@/components/ui/number'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

/** 工具组的中文名：与后端 toolgroups.All 的分组一一对应；未知分组原样显示，不编造语义 */
export const TOOL_GROUP_LABEL: Record<string, string> = {
  hosts: '主机清单',
  exec: '命令执行',
  fanout: '批量执行',
  jobs: '后台任务',
  files: '文件读写',
  search: '搜索',
  monitor: '资源监控',
  image: '图片查看',
  memory: '运维记忆',
}

export const groupLabel = (name: string) => TOOL_GROUP_LABEL[name] ?? name

/** 权限的完整描述：向导、编辑、OAuth 授权页共用同一份状态形状 */
export type Scope = {
  all_hosts: boolean
  host_ids: number[]
  disabled_tools: string[]
  manage_hosts: boolean
}

export const scopeOfToken = (token: Token): Scope => ({
  all_hosts: token.all_hosts,
  host_ids: token.host_ids ?? [],
  disabled_tools: token.disabled_tools ?? [],
  manage_hosts: token.manage_hosts,
})

/**
 * 范围是否能落地：没有主机且不能管理主机的令牌什么也做不了。
 * 管理权限独立于执行范围，只开管理、不给执行主机是合法组合（与后端一致）。
 */
export const scopeError = (scope: Scope) =>
  !scope.all_hosts && scope.host_ids.length === 0 && !scope.manage_hosts
    ? '至少选择一台主机，或者开启「管理主机」权限'
    : ''

/* ── 主机范围 ──────────────────────────────────────────────────────── */

const hostAddress = (host: Host) => {
  const addr = host.addr.includes(':') ? `[${host.addr}]` : host.addr
  return `${host.username}@${addr}:${host.port}`
}

/**
 * 主机范围选择：「指定主机 / 全部主机」两档。指定时是两列可勾选的网格，
 * 支持多关键词检索（名称、user@addr:port、标签，空格分隔取交集）、按标签一键加入、全选当前结果。
 * 「全部主机」意味着以后新加的主机也自动包含在内，所以单独成一档并写明后果。
 */
export function HostScopePicker({
  hosts,
  all,
  onAllChange,
  value,
  onChange,
  invalid,
  shake = 0,
  disabled,
}: {
  hosts: Host[]
  all: boolean
  onAllChange: (all: boolean) => void
  value: number[]
  onChange: (value: number[]) => void
  invalid?: boolean
  /** 每次自增触发一次摇晃（校验失败时由父组件 +1） */
  shake?: number
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [grid, animateGrid] = useAnimate()
  const selected = useMemo(() => new Set(value), [value])
  const tags = useMemo(() => [...new Set(hosts.flatMap((h) => h.tags))].sort(), [hosts])

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const visible = hosts.filter((host) => {
    const text = `${host.name} ${hostAddress(host)} ${host.tags.join(' ')}`.toLowerCase()
    return terms.every((term) => text.includes(term))
  })
  const allVisibleSelected = visible.length > 0 && visible.every((h) => selected.has(h.id))

  const toggle = (id: number) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id])
  const addTag = (tag: string) => {
    const next = new Set(value)
    for (const host of hosts) if (host.tags.includes(tag)) next.add(host.id)
    onChange([...next])
  }
  const toggleVisible = () => {
    const ids = new Set(visible.map((h) => h.id))
    onChange(allVisibleSelected ? value.filter((v) => !ids.has(v)) : [...new Set([...value, ...ids])])
  }

  // 校验失败时网格轻轻摇一下：比红字更快地把视线带到出错的地方
  useEffect(() => {
    if (shake > 0 && grid.current) void animateGrid(grid.current, { x: [0, -7, 6, -4, 3, 0] }, { duration: 0.36 })
  }, [shake, animateGrid, grid])

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <Segmented
          value={all ? 'all' : 'pick'}
          onChange={(v) => !disabled && onAllChange(v === 'all')}
          options={[
            { value: 'pick', label: '指定主机' },
            { value: 'all', label: '全部主机' },
          ]}
          aria-label="主机范围"
        />
        <span className="ml-auto text-[12px] text-ink-3">
          已选{' '}
          <b className="font-medium text-ink">
            <Num value={all ? hosts.length : value.length} />
          </b>{' '}
          / {hosts.length} 台
        </span>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {all ? (
          <motion.div
            key="all"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: spring.snap }}
            exit={{ opacity: 0, transition: spring.exit }}
          >
            <Well className="mt-3.5 flex gap-2.5 p-3.5 text-[12.5px] leading-relaxed text-ink-2">
              <Info size={16} className="mt-px shrink-0 text-ink-3" />
              <span>
                包括当前的 {hosts.length} 台主机，以及<b className="font-medium text-ink">以后添加的任何主机</b>
                。适合你完全信任的主力 Agent；其余情况请指定主机，范围越小越好。
              </span>
            </Well>
          </motion.div>
        ) : (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: spring.snap }}
            exit={{ opacity: 0, transition: spring.exit }}
          >
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
              {hosts.length > 8 && (
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="名称、地址或标签，空格组合"
                  aria-label="检索主机"
                  prefix={<MagnifyingGlass />}
                  wrapperClassName="mr-1 h-[26px] w-56"
                  className="text-[12.5px]"
                />
              )}
              {tags.map((tag) => (
                <Chip key={tag} mono onClick={() => addTag(tag)} disabled={disabled}>
                  + {tag}
                </Chip>
              ))}
              {(query || hosts.length > 8) && visible.length > 0 && (
                <Chip onClick={toggleVisible} disabled={disabled}>
                  {allVisibleSelected ? '取消结果' : `全选结果 ${visible.length}`}
                </Chip>
              )}
              {value.length > 0 && (
                <Chip onClick={() => onChange([])} disabled={disabled}>
                  清空
                </Chip>
              )}
            </div>
            <div
              ref={grid}
              className={cn(
                'mt-2.5 grid max-h-[236px] grid-cols-1 gap-1 overflow-y-auto rounded-[12px] bg-well p-1 shadow-well sm:grid-cols-2',
                invalid && 'shadow-[inset_0_0_0_1px_var(--bad)]',
              )}
            >
              {visible.length === 0 && (
                <p className="col-span-full px-2.5 py-6 text-center text-[12.5px] text-ink-3">
                  {hosts.length === 0 ? '当前没有可授权的主机' : `没有匹配「${query.trim()}」的主机`}
                </p>
              )}
              {visible.map((host) => {
                const on = selected.has(host.id)
                return (
                  <button
                    key={host.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => toggle(host.id)}
                    title={hostAddress(host)}
                    className="flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-left transition-colors duration-100 hover:bg-hover-2 disabled:opacity-60"
                  >
                    <motion.span
                      key={String(on)}
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', visualDuration: 0.25, bounce: 0.4 }}
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded-[5px]',
                        on
                          ? 'bg-primary text-primary-fg shadow-[0_0_0_1px_var(--primary)]'
                          : 'bg-surface text-transparent shadow-[0_0_0_1px_var(--edge-2),0_1px_1px_rgb(0_0_0/.04)]',
                      )}
                    >
                      <Check size={11} weight="bold" />
                    </motion.span>
                    <span className="truncate font-mono text-[12.5px]">{host.name}</span>
                    {host.health?.state === 'offline' && <Dot tone="bad" label="离线" className="size-1.5" />}
                    <span className="ml-auto shrink-0 truncate text-[11px] text-ink-3">{host.tags[0] ?? ''}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── 工具组 ────────────────────────────────────────────────────────── */

/**
 * 工具组逐项开关：开 = Agent 能看到并调用这组工具；关掉的组从 tools/list 里消失，
 * 调用会被网关直接拒绝并记入审计。实例级 ONESSH_DISABLED_TOOLS 永远优先于这里。
 */
export function ToolGroupSwitches({
  groups,
  disabled,
  onChange,
  locked,
}: {
  groups: ToolGroup[]
  disabled: string[]
  onChange: (disabled: string[]) => void
  locked?: boolean
}) {
  const off = new Set(disabled)
  const toggle = (name: string) => onChange(off.has(name) ? disabled.filter((g) => g !== name) : [...disabled, name])
  if (groups.length === 0) {
    return <Well className="p-4 text-[12.5px] text-ink-3">正在读取工具分组…</Well>
  }
  return (
    <div className="flex flex-col gap-0.5 rounded-[12px] bg-well p-1 shadow-well">
      {groups.map((group) => {
        const enabled = !off.has(group.name)
        return (
          <div
            key={group.name}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked || undefined}
            onClick={() => !locked && toggle(group.name)}
            onKeyDown={(event) => {
              if (locked || event.target !== event.currentTarget) return
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                toggle(group.name)
              }
            }}
            className={cn(
              'grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] px-2.5 py-2 transition-colors duration-100 hover:bg-hover-2',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
              locked && 'cursor-default opacity-60',
            )}
          >
            <div className="min-w-0">
              <div className={cn('text-[13px] font-medium', !enabled && 'text-ink-2')}>{groupLabel(group.name)}</div>
              <div className="mt-px truncate font-mono text-[11px] text-ink-3">{group.tools.join(' · ')}</div>
            </div>
            <span onClick={(event) => event.stopPropagation()}>
              <Switch
                checked={enabled}
                onCheckedChange={() => toggle(group.name)}
                disabled={locked}
                aria-label={`${enabled ? '禁用' : '启用'}${groupLabel(group.name)}`}
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── 管理主机（危险） ──────────────────────────────────────────────── */

/**
 * 「允许管理主机」是一张有分量的卡：开启时整张变红底，图标轻轻一抖。
 * 它不扩大执行范围，但能改变「有哪些主机」——一枚泄露的管理令牌可以把主机指向别处。
 */
export function ManageHostsCard({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const [icon, animateIcon] = useAnimate()
  const flip = (next: boolean) => {
    if (disabled) return
    onChange(next)
    if (next && icon.current) void animateIcon(icon.current, { rotate: [0, -8, 6, 0] }, { duration: 0.4 })
  }
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => flip(!checked)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          flip(!checked)
        }
      }}
      className={cn(
        'grid cursor-pointer grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-3 rounded-[12px] p-3.5 transition-[background-color,box-shadow] duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        checked ? 'bg-bad-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--bad)_30%,transparent)]' : 'bg-well shadow-well',
        disabled && 'cursor-default opacity-60',
      )}
    >
      <span
        ref={icon}
        className={cn(
          'grid size-9 place-items-center rounded-[10px] bg-surface shadow-card transition-colors duration-200',
          checked ? 'text-bad' : 'text-ink-2',
        )}
      >
        <Warning size={17} weight="bold" />
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium">允许管理主机配置</div>
        <p className="mt-[3px] text-[12.5px] leading-relaxed text-ink-2">
          可调用 <code className="font-mono text-[11.5px]">host_create / host_update / host_delete / host_reset_fingerprint</code>
          ，作用于全部主机。它<b className="font-medium text-ink">不会扩大</b>命令与文件工具能碰的主机范围，但一枚泄露的管理令牌能把主机指向别处。
        </p>
      </div>
      <span onClick={(event) => event.stopPropagation()}>
        <Switch checked={checked} onCheckedChange={flip} danger disabled={disabled} aria-label="允许管理主机配置" />
      </span>
    </div>
  )
}

/* ── 能力预览 / 能力指纹 ──────────────────────────────────────────── */

/** 「这枚令牌能做什么」：一句话把主机范围、可用工具、禁用工具、管理权限串起来 */
export function CapabilityPreview({
  name,
  scope,
  groups,
  hostCount,
  className,
}: {
  name?: string
  scope: Scope
  groups: ToolGroup[]
  hostCount: number
  className?: string
}) {
  const off = new Set(scope.disabled_tools)
  const on = groups.filter((g) => !off.has(g.name)).map((g) => groupLabel(g.name))
  const denied = groups.filter((g) => off.has(g.name)).map((g) => groupLabel(g.name))
  const hosts = scope.all_hosts ? (
    <>
      <b className="font-medium text-ink">全部主机</b>（含以后新增的 · 当前 {hostCount} 台）
    </>
  ) : scope.host_ids.length ? (
    <b className="font-medium text-ink">{scope.host_ids.length} 台主机</b>
  ) : (
    <span className="text-ink-3">尚未选择的主机</span>
  )
  return (
    <div className={cn('rounded-[10px] bg-surface p-3 text-[12px] leading-[1.65] text-ink-2 shadow-card', className)}>
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink">
        <Eye size={14} />
        能力预览
      </div>
      {name ? <b className="font-mono font-medium text-ink">{name}</b> : '这枚令牌'} 可以在 {hosts} 上：
      {on.length ? on.join('、') : <span className="text-ink-3">什么也做不了</span>}。
      {denied.length > 0 && <div className="mt-1.5 text-ink-3">不能：{denied.join('、')}</div>}
      {scope.manage_hosts && <div className="mt-1.5 text-warn">还能增删改全部主机的配置</div>}
    </div>
  )
}

/**
 * 能力指纹：每个工具组一格，可用实心、禁用空心；最后一格是管理权限，开启为琥珀。
 * 一列令牌并排看，谁的权限更宽一眼可辨。
 */
export function CapabilityFingerprint({ token, groups }: { token: Pick<Token, 'disabled_tools' | 'manage_hosts'>; groups: ToolGroup[] }) {
  const off = new Set(token.disabled_tools ?? [])
  const detail = [
    `可用：${groups.filter((g) => !off.has(g.name)).map((g) => groupLabel(g.name)).join('、') || '无'}`,
    off.size ? `禁用：${groups.filter((g) => off.has(g.name)).map((g) => groupLabel(g.name)).join('、')}` : '',
    token.manage_hosts ? '可管理主机配置' : '',
  ]
    .filter(Boolean)
    .join('；')
  return (
    <Tooltip content={detail}>
      <span className="inline-flex gap-[3px]" aria-label={detail} role="img">
        {groups.map((g) => (
          <i
            key={g.name}
            className={cn(
              'size-3 rounded-[3.5px]',
              off.has(g.name) ? 'shadow-[inset_0_0_0_1.25px_var(--ink-4)]' : 'bg-ink-2',
            )}
          />
        ))}
        <i className={cn('ml-[3px] size-3 rounded-[3.5px]', token.manage_hosts ? 'bg-warn' : 'shadow-[inset_0_0_0_1.25px_var(--ink-4)]')} />
      </span>
    </Tooltip>
  )
}

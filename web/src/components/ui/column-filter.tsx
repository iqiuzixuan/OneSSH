import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Check, FunnelSimple, MagnifyingGlass } from '@phosphor-icons/react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { HashBadge } from './badge'

export type ColumnFilterOption<T extends string | number> = { value: T; label: string }

type Common<T extends string | number> = {
  options: ColumnFilterOption<T>[]
  /** 漏斗按钮的无障碍名，通常就是列名 */
  'aria-label': string
  className?: string
  /** 选项渲染成徽章（标签这类天然徽章的数据），与表格单元格里的徽章样式一致 */
  optionBadge?: boolean
}

type MultiProps<T extends string | number> = {
  multi: true
  value: T[]
  onChange: (value: T[]) => void
}

type SingleProps<T extends string | number> = {
  multi?: false
  /** null 表示「全部」 */
  value: T | null
  onChange: (value: T | null) => void
  allLabel?: string
}

/**
 * 列头内联筛选：表头文字旁的小漏斗，点开是带即时搜索的选项弹层。
 * 多选（标签这类）点选不关闭；单选（认证方式这类）点选即关，含「全部」。
 * 激活时漏斗变主题色，并由调用方在列头把当前值/计数渲染出来。
 */
export function ColumnFilter<T extends string | number>(
  props: Common<T> & (MultiProps<T> | SingleProps<T>),
) {
  const { options, className } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const active = props.multi ? props.value.length > 0 : props.value != null
  const q = query.trim().toLowerCase()
  const visible = options.filter((o) => !q || o.label.toLowerCase().includes(q))

  const toggleMulti = (v: T) => {
    if (!props.multi) return
    props.onChange(
      props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v],
    )
  }
  const pickSingle = (v: T | null) => {
    if (props.multi) return
    props.onChange(v)
    setOpen(false)
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverPrimitive.Trigger
        type="button"
        aria-label={props['aria-label']}
        aria-expanded={open}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-[6px] text-faint normal-case transition-colors',
          'hover:bg-accent-soft hover:text-accent-ink',
          (active || open) && 'bg-accent-soft text-accent-ink',
          className,
        )}
      >
        <FunnelSimple size={11} weight={active ? 'fill' : 'regular'} />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="z-50 flex max-h-72 w-52 flex-col overflow-hidden rounded-container border border-border bg-surface shadow-pop"
        >
          {/* 搜索框常显：选项随时可能增长，即时过滤的成本远低于「超过 N 个才出现」的交互跳变 */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <MagnifyingGlass size={13} className="shrink-0 text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索选项…"
              className="w-full bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {!props.multi && (
              <button
                type="button"
                onClick={() => pickSingle(null)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-[13px] text-muted hover:bg-surface-2"
              >
                <span className="flex-1">{props.allLabel ?? '全部'}</span>
                {props.value == null && <Check size={13} weight="bold" className="text-accent" />}
              </button>
            )}
            {visible.length === 0 && (
              <p className="px-3 py-2 text-[12.5px] text-muted">没有匹配「{query.trim()}」的选项</p>
            )}
            {visible.map((o) => {
              const selected = props.multi ? props.value.includes(o.value) : props.value === o.value
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  role={props.multi ? 'menuitemcheckbox' : 'menuitemradio'}
                  aria-checked={selected}
                  onClick={() => (props.multi ? toggleMulti(o.value) : pickSingle(o.value))}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-[13px] text-text hover:bg-surface-2"
                >
                  <span className="flex-1 truncate">
                    {props.optionBadge ? (
                      // 与表格单元格里的徽章同款哈希取色：选项和列表里同一个值同一个颜色
                      <HashBadge value={o.label} className="text-[10.5px]">
                        {o.label}
                      </HashBadge>
                    ) : (
                      o.label
                    )}
                  </span>
                  {selected && <Check size={13} weight="bold" className="shrink-0 text-accent" />}
                </button>
              )
            })}
          </div>
          {props.multi && props.value.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
              <span className="text-[12px] text-muted tabular-nums">已选 {props.value.length} 项</span>
              <button
                type="button"
                onClick={() => props.multi && props.onChange([])}
                className="cursor-pointer text-[12px] text-muted transition-colors hover:text-danger"
              >
                清空
              </button>
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

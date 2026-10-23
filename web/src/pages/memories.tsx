import { Brain, CaretLeft, CaretRight, MagnifyingGlass, Trash, WarningCircle } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { forwardRef, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDeleteMemories, useDeleteMemory, useHosts, useMemories, useMemoryStats } from '@/api/queries'
import type { MemoryRow } from '@/api/types'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Tag } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Num } from '@/components/ui/number'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { SelectionBar } from '@/components/ui/selection-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { formatAgo, formatTime } from '@/lib/format'
import { spring, staggerItem } from '@/lib/motion'

const PAGE_SIZE = 50
/** 筛选值全部是字符串：'all' 与主机 id 混在一起；后端约定 host_id=0 表示全局库 */
const ALL_BANKS = 'all'
const GLOBAL_BANK = '0'

/** 后端 CHECK 约束的四个取值；未知值原样透出 */
const VERACITY: Record<string, { label: string; className: string; hint: string }> = {
  stated: { label: '断言', className: 'bg-primary text-primary-fg', hint: 'Agent 明确陈述的事实' },
  inferred: { label: '推断', className: 'text-ink-2 shadow-[inset_0_0_0_1px_var(--edge-2)]', hint: '由现象推断，可能需要复核' },
  tool: { label: '工具', className: 'bg-well-2 text-ink-2', hint: '工具输出直接观测到的' },
  // 来源不明是唯一需要提醒的可信度，所以只有它带状态色
  unknown: { label: '未知', className: 'bg-warn-soft text-warn', hint: '来源不明，使用前请确认' },
}

function Veracity({ value }: { value: string }) {
  const meta = VERACITY[value] ?? { label: value, className: 'bg-well-2 text-ink-2', hint: value }
  return (
    <Tooltip content={`${meta.hint} · veracity=${value}`}>
      <span className={cn('inline-flex h-5 items-center rounded-[6px] px-[7px] text-[11.5px]', meta.className)}>{meta.label}</span>
    </Tooltip>
  )
}

/** 重要度 0–1：十格刻度给跨卡片可比的量级，悬停给精确值 */
function Importance({ value }: { value: number }) {
  const ticks = Math.round(Math.min(Math.max(value, 0), 1) * 10)
  return (
    <Tooltip content={`重要度 ${value.toFixed(2)}`}>
      <span className="inline-flex items-center gap-[2px]" aria-label={`重要度 ${value.toFixed(2)}`}>
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={cn('h-2.5 w-[3px] rounded-[1.5px]', i < ticks ? 'bg-ink-2' : 'bg-ink-4')} />
        ))}
      </span>
    </Tooltip>
  )
}

type Bank = { key: string; name: string; count: number; embedded: number; last?: number | null }

/** 左侧记忆库列表：选中块是共享布局元素，切库时弹簧滑过去 */
function BankList({ banks, value, onChange }: { banks: Bank[]; value: string; onChange: (key: string) => void }) {
  return (
    <nav aria-label="记忆库" className="flex flex-col gap-px">
      {banks.map((bank) => {
        const on = bank.key === value
        const ratio = bank.count ? bank.embedded / bank.count : 0
        return (
          <button
            key={bank.key}
            type="button"
            aria-current={on || undefined}
            onClick={() => onChange(bank.key)}
            className={cn(
              'relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 rounded-well px-2.5 py-[9px] text-left transition-colors duration-150',
              !on && 'hover:bg-hover',
            )}
          >
            {on && <motion.span layoutId="bank-ind" className="absolute inset-0 rounded-well bg-well shadow-well" transition={spring.snap} />}
            <span className={cn('relative truncate text-[13px]', on ? 'font-medium' : 'text-ink-2')}>{bank.name}</span>
            <span className="relative font-mono text-[12px] text-ink-2">
              <Num value={bank.count} />
            </span>
            <span className="relative col-span-2 flex items-center gap-2 text-[11px] text-ink-3">
              <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-well-2">
                <span className="block h-full rounded-full bg-ink-3" style={{ width: `${ratio * 100}%` }} />
              </span>
              {bank.count === 0 ? '空' : bank.embedded === 0 ? '未向量化' : bank.embedded === bank.count ? '已向量化' : `${bank.embedded}/${bank.count}`}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

/** popLayout 需要拿到子元素的 ref 来测量退出前的位置，所以转发给外层 motion.div */
const MemoryCard = forwardRef<
  HTMLDivElement,
  {
    memory: MemoryRow
    selecting: boolean
    selected: boolean
    onToggle: () => void
    onDelete: () => void
  }
>(function MemoryCard({ memory, selecting, selected, onToggle, onDelete }, ref) {
  return (
    <motion.div
      ref={ref}
      layout="position"
      initial={false}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}
      transition={spring.soft}
    >
      <Card
        className={cn(
          'group/mem relative px-4 py-3.5 transition-shadow duration-150',
          selected && 'shadow-[0_0_0_1.5px_var(--ink),0_1px_2px_rgb(0_0_0/.04)]',
        )}
      >
        <div className="flex gap-3">
          <span className={cn('pt-[3px]', selecting || selected ? 'block' : 'hidden group-hover/mem:block')}>
            <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`选择记忆 #${memory.id}`} />
          </span>
          <p className="min-w-0 flex-1 text-[13.5px] leading-[1.7] break-words">{memory.content}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-3">
          <Tag>{memory.host_name ?? (memory.host_id == null ? '全局' : `#${memory.host_id}`)}</Tag>
          <Veracity value={memory.veracity} />
          <Importance value={memory.importance} />
          <span className="tabular-nums">召回 {memory.recall_count} 次</span>
          <span className="max-w-[16rem] truncate">来自 {memory.source}</span>
          <span title={`写入 ${formatTime(memory.created_at)}${memory.updated_at > memory.created_at ? ` · 更新 ${formatTime(memory.updated_at)}` : ''}`}>
            {memory.updated_at > memory.created_at ? '更新于' : '写入于'} {formatAgo(memory.updated_at * 1000)}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`删除记忆 #${memory.id}`}
            onClick={onDelete}
            className="ml-auto opacity-0 group-hover/mem:opacity-100 hover:bg-bad-soft hover:text-bad focus-visible:opacity-100"
          >
            <Trash />
          </Button>
        </div>
      </Card>
    </motion.div>
  )
})

export function MemoriesPage() {
  const [params, setParams] = useSearchParams()
  const bank = params.get('bank') ?? ALL_BANKS
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [deleting, setDeleting] = useState<MemoryRow | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)

  useEffect(() => {
    // 搜索走后端 LIKE：逐字符发请求既压网关也让列表反复重排，敲停 300ms 再查
    const timer = window.setTimeout(() => {
      setQuery(search.trim())
      setOffset(0)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    // 选中项只对当前这一屏有意义：跨库 / 跨搜索 / 跨页留着会让批量删除误伤看不见的记忆
    setSelected((prev) => (prev.size === 0 ? prev : new Set()))
  }, [bank, query, offset])

  const hosts = useHosts()
  const stats = useMemoryStats()
  const hostId = bank === ALL_BANKS ? undefined : Number(bank)
  const memories = useMemories({ hostId, q: query, limit: PAGE_SIZE, offset })
  const deleteMemory = useDeleteMemory()
  const deleteMemories = useDeleteMemories()

  const banks: Bank[] = useMemo(() => {
    const list = stats.data ?? []
    const total = list.reduce((acc, s) => ({ count: acc.count + s.count, embedded: acc.embedded + s.embedded }), { count: 0, embedded: 0 })
    const global = list.find((s) => s.host_id == null)
    const hostBanks = list
      .filter((s) => s.host_id != null)
      .sort((a, b) => b.count - a.count)
      .map((s) => ({
        key: String(s.host_id),
        name: s.host_name ?? hosts.data?.find((h) => h.id === s.host_id)?.name ?? `#${s.host_id}`,
        count: s.count,
        embedded: s.embedded,
        last: s.last_written,
      }))
    // URL 指向一台还没有记忆的主机时，也给它一行，选中态才有落点
    if (hostId && hostId > 0 && !hostBanks.some((b) => b.key === bank)) {
      const host = hosts.data?.find((h) => h.id === hostId)
      hostBanks.push({ key: bank, name: host?.name ?? `#${hostId}`, count: 0, embedded: 0, last: null })
    }
    return [
      { key: ALL_BANKS, name: '全部记忆库', ...total },
      { key: GLOBAL_BANK, name: '全局', count: global?.count ?? 0, embedded: global?.embedded ?? 0, last: global?.last_written },
      ...hostBanks,
    ]
  }, [stats.data, hosts.data, bank, hostId])

  const current = banks.find((b) => b.key === bank)
  const rows = memories.data ?? []
  const narrowed = bank !== ALL_BANKS || query !== '' || offset > 0
  const hasNext = rows.length === PAGE_SIZE
  const total = banks[0]

  const changeBank = (key: string) => {
    const next = new URLSearchParams(params)
    if (key === ALL_BANKS) next.delete('bank')
    else next.set('bank', key)
    setParams(next, { replace: true })
    setOffset(0)
  }

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <PageTransition>
      <PageHeader
        title="记忆"
        description="Agent 跨会话积累的运维事实：部署路径、服务拓扑、踩过的坑。每台主机一个独立库，外加一个全局库。"
        actions={
          stats.data && (
            <span className="text-[12px] text-ink-3 tabular-nums">
              共 {total.count} 条{total.embedded > 0 ? ` · 已向量化 ${total.embedded}` : ' · 未配置语义向量，按关键词召回'}
            </span>
          )
        }
      />

      <div className="grid items-start gap-3 lg:grid-cols-[264px_minmax(0,1fr)]">
        <motion.div variants={staggerItem} className="lg:sticky lg:top-5">
          <Card className="p-1.5">
            {stats.isError ? (
              <div className="px-2.5 py-3 text-[12.5px] text-ink-2">
                记忆库统计加载失败：{(stats.error as Error).message}
                <Button size="sm" className="mt-2.5" onClick={() => void stats.refetch()}>
                  重试
                </Button>
              </div>
            ) : stats.isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            ) : (
              <BankList banks={banks} value={bank} onChange={changeBank} />
            )}
          </Card>
        </motion.div>

        <div className="min-w-0">
          <motion.div variants={staggerItem} className="mb-3 flex flex-wrap items-center gap-2.5">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索记忆内容"
              aria-label="搜索记忆内容"
              spellCheck={false}
              prefix={<MagnifyingGlass />}
              wrapperClassName="max-w-[360px] flex-1"
            />
            {rows.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2 select-none">
                <Checkbox
                  checked={selected.size === 0 ? false : selected.size === rows.length ? true : 'indeterminate'}
                  onCheckedChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}
                  aria-label="选择本页全部"
                />
                本页全选
              </label>
            )}
            {current && bank !== ALL_BANKS && (
              <span className="ml-auto text-[12px] text-ink-3 tabular-nums">
                本库 {current.count} 条{current.last ? ` · 最近写入 ${formatAgo(current.last * 1000)}` : ''}
              </span>
            )}
          </motion.div>

          {memories.isError ? (
            <Card>
              <EmptyState
                icon={<WarningCircle />}
                title="记忆列表加载失败"
                description={(memories.error as Error).message}
                action={<Button onClick={() => void memories.refetch()}>重试</Button>}
              />
            </Card>
          ) : memories.isLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[104px] rounded-card" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Card>
              {narrowed ? (
                <EmptyState
                  icon={<MagnifyingGlass />}
                  title="没有匹配的记忆"
                  description={query ? `没有包含「${query}」的记录。换个关键词，或者去别的库看看。` : '这个库里还没有记忆。'}
                  action={
                    <Button
                      onClick={() => {
                        setSearch('')
                        setQuery('')
                        setOffset(0)
                        changeBank(ALL_BANKS)
                      }}
                    >
                      清除筛选
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Brain />}
                  title="还没有记忆"
                  description="Agent 确认有长期价值的事实后，会用 memory_remember 写进来，之后可被 memory_recall 召回。"
                />
              )}
            </Card>
          ) : (
            <div className={cn('flex flex-col gap-2.5 transition-opacity duration-150', memories.isPlaceholderData && 'opacity-60')}>
              <AnimatePresence mode="popLayout" initial={false}>
                {rows.map((memory) => (
                  <MemoryCard
                    key={memory.id}
                    memory={memory}
                    selecting={selected.size > 0}
                    selected={selected.has(memory.id)}
                    onToggle={() => toggle(memory.id)}
                    onDelete={() => setDeleting(memory)}
                  />
                ))}
              </AnimatePresence>

              {(offset > 0 || hasNext) && (
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="text-[12px] text-ink-3 tabular-nums">
                    第 {offset + 1}–{offset + rows.length} 条
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={offset === 0} onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}>
                      <CaretLeft />
                      上一页
                    </Button>
                    {/* 后端不返回总数，只能用「本页取满」判断还有下一页 */}
                    <Button size="sm" disabled={!hasNext} onClick={() => setOffset((prev) => prev + PAGE_SIZE)}>
                      下一页
                      <CaretRight />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button
          type="button"
          onClick={() => setBatchDeleting(true)}
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium"
        >
          <Trash size={14} />
          删除
        </button>
      </SelectionBar>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        danger
        icon={<Trash weight="bold" />}
        title="删除这条记忆？"
        description={
          deleting
            ? `“${deleting.content.slice(0, 60)}${deleting.content.length > 60 ? '…' : ''}” Agent 之后将无法再召回它。如果只是过时了，更好的做法是让 Agent 用 memory_update 修正。`
            : undefined
        }
        confirmText="删除"
        onConfirm={async () => {
          if (!deleting) return
          // 不吞异常：失败时弹层保持打开可直接重试，提示由 mutation 的统一 onError 给
          await deleteMemory.mutateAsync(deleting.id)
          setSelected((prev) => {
            if (!prev.has(deleting.id)) return prev
            const next = new Set(prev)
            next.delete(deleting.id)
            return next
          })
        }}
      />

      <ConfirmDialog
        open={batchDeleting}
        onOpenChange={setBatchDeleting}
        danger
        icon={<Trash weight="bold" />}
        title={`删除 ${selected.size} 条记忆？`}
        description="删除后 Agent 将无法再召回这些记忆，此操作不可撤销。"
        confirmText="删除"
        onConfirm={async () => {
          // 失败的留在选中态，方便对照着重试
          const { failedIds } = await deleteMemories.mutateAsync([...selected])
          setSelected(new Set(failedIds))
        }}
      />
    </PageTransition>
  )
}

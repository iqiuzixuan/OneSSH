import { MagnifyingGlass, Pulse } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useAudit, useAuditTools, type AuditFilter } from '@/api/queries'
import type { Audit } from '@/api/types'
import { CommandRunDetail, ParamsList } from '@/components/command-run-detail'
import { CopyableBlock } from '@/components/copyable-block'
import { Badge, Dot, HashBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ColumnFilter } from '@/components/ui/column-filter'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Sheet } from '@/components/ui/sheet'
import { auditParamEntries, auditSummary, parseAuditParams } from '@/lib/audit'
import { cn } from '@/lib/cn'
import { formatBytes, formatClock, formatDuration } from '@/lib/format'

/** 退出码列的筛选值：审计没有逐调用的退出码，用调用结果 ok/fail 代替 */
type ResultFilter = 'ok' | 'fail'

function tokenLabel(item: Audit): string {
  const id = item.TokenID?.Valid ? `#${item.TokenID.Int64}` : ''
  if (item.TokenName?.Valid) return `${item.TokenName.String}${id ? ` · ${id}` : ''}`
  if (id) return `已删除令牌 · ${id}`
  return '系统'
}

function AuditDetail({ item }: { item: Audit }) {
  const params = parseAuditParams(item.ParamsJSON)
  const command = params && typeof params.command === 'string' ? params.command.trim() : ''
  const summary = command ? '' : auditSummary(item)
  const entries = auditParamEntries(item)

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-[11px] tracking-wide text-muted uppercase">结果</dt>
          <dd className="mt-1">
            {item.OK ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Dot className="text-success" />
                成功
              </span>
            ) : (
              <Badge variant="danger">失败</Badge>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted uppercase">耗时</dt>
          <dd className="mt-1 tabular-nums">{formatDuration(item.DurationMS)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted uppercase">输出</dt>
          <dd className="mt-1 tabular-nums text-muted">
            {item.BytesOut ? formatBytes(item.BytesOut) : '—'}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-[11px] tracking-wide text-muted uppercase">令牌</dt>
          <dd className="mt-1 truncate" title={tokenLabel(item)}>
            {tokenLabel(item)}
          </dd>
        </div>
      </dl>

      {command ? (
        <CopyableBlock label="命令" value={command} />
      ) : summary ? (
        <CopyableBlock label="调用" value={summary} />
      ) : null}

      {entries.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] tracking-wide text-muted uppercase">参数</p>
          <ParamsList entries={entries} />
        </div>
      ) : !command && !summary ? (
        <p className="text-[13px] text-muted">此次调用没有记录额外参数。</p>
      ) : null}
    </div>
  )
}

function AuditSheetContent({ item }: { item: Audit }) {
  const runIDs = item.RunIDs ?? []
  const [preferredRunID, setPreferredRunID] = useState('')
  const activeRunID = runIDs.includes(preferredRunID) ? preferredRunID : runIDs[0]

  // 没有关联执行记录的调用（读文件、查主机等）只展示当时记录的参数
  if (!activeRunID) return <AuditDetail item={item} />

  return (
    <div className="space-y-4">
      {runIDs.length > 1 && (
        <div>
          <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">
            批量执行 · {runIDs.length} 台主机
          </p>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="选择命令执行记录">
            {runIDs.map((runID, index) => (
              <Button
                key={runID}
                size="sm"
                variant={runID === activeRunID ? 'primary' : 'outline'}
                role="tab"
                aria-selected={runID === activeRunID}
                onClick={() => setPreferredRunID(runID)}
              >
                执行 {index + 1} · {runID.slice(0, 8)}
              </Button>
            ))}
          </div>
        </div>
      )}
      <CommandRunDetail id={activeRunID} audit={item} />
    </div>
  )
}

export function ActivityPage() {
  // 类型是精确工具名（几十种），筛选走列头漏斗而不是平铺控件；退出码筛调用结果
  const [filterTools, setFilterTools] = useState<string[]>([])
  const [filterResult, setFilterResult] = useState<ResultFilter | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Audit | null>(null)
  const auditTools = useAuditTools()

  // 只用全量工具清单做选项，不并入当前页数据——否则 filter→audit→工具清单会绕成循环
  const toolOptions = useMemo(
    () => [...(auditTools.data ?? [])].map((name) => ({ value: name, label: name })),
    [auditTools.data],
  )

  const filter: AuditFilter = {
    tool: filterTools,
    ok: filterResult == null ? undefined : filterResult === 'ok',
  }
  const audit = useAudit(filter)

  const needle = query.trim().toLowerCase()
  const rows = useMemo(() => {
    const list = audit.data ?? []
    if (!needle) return list
    // 只在当前页 100 条里搜命令/参数：审计接口没有全文检索，避免把「没搜到」说成「从没发生」
    return list.filter((row) => {
      const hay = `${row.Tool} ${auditSummary(row)} ${row.ParamsJSON} ${row.Host?.Valid ? row.Host.String : ''}`
      return hay.toLowerCase().includes(needle)
    })
  }, [audit.data, needle])
  const filtered = filterTools.length > 0 || filterResult != null || needle !== ''

  // 列头挂着筛选控件，列定义随筛选状态重建；单元格渲染本身无状态
  const auditColumns: Column<Audit>[] = [
    {
      key: 'Ts',
      title: '时间',
      // 审计日志没有时间就失去一半价值，窄屏也保留，靠收紧单元格内边距让出空间
      className: 'w-[84px] font-mono text-[11px] text-faint tabular-nums',
      render: (item) => formatClock(item.Ts),
    },
    {
      key: 'Tool',
      title: (
        <span className="inline-flex items-center gap-1.5">
          类型
          <ColumnFilter
            multi
            optionBadge
            aria-label="按类型筛选"
            value={filterTools}
            onChange={setFilterTools}
            options={toolOptions}
          />
          {filterTools.length > 0 && (
            <span className="rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-accent-ink tabular-nums">
              {filterTools.length}
            </span>
          )}
        </span>
      ),
      className: 'w-[12rem]',
      // 工具名按值哈希取色：同一个工具永远同一个颜色，不同的工具几乎必然不同色
      render: (item) => (
        <HashBadge value={item.Tool} className="font-mono text-[10.5px]">
          {item.Tool}
        </HashBadge>
      ),
    },
    {
      key: 'Host',
      title: '主机 / 主体',
      className: 'hidden w-[10rem] text-muted sm:table-cell',
      render: (item) => {
        const host = item.Host?.Valid ? item.Host.String : '—'
        return (
          <span className="block truncate" title={host}>
            {host}
          </span>
        )
      },
    },
    {
      key: 'ParamsJSON',
      title: '命令 · 详情',
      // 这列才是「Agent 跑了什么」：命令、路径、检索式。固定布局下它不设宽度、吃掉剩余空间，
      // 窄屏也留着，靠 truncate + title 看全句
      render: (item) => {
        const summary = auditSummary(item)
        return (
          <span className="block truncate font-mono text-[11.5px]" title={summary || undefined}>
            {summary || '—'}
          </span>
        )
      },
    },
    {
      key: 'OK',
      title: (
        <span className="inline-flex items-center gap-1.5">
          退出码
          <ColumnFilter
            aria-label="按结果筛选"
            allLabel="全部结果"
            value={filterResult}
            onChange={setFilterResult}
            options={[
              { value: 'ok', label: 'ok' },
              { value: 'fail', label: 'fail' },
            ]}
          />
          {filterResult && <span className="font-mono text-[10px] text-accent-ink">{filterResult}</span>}
        </span>
      ),
      className: 'w-[76px] font-mono text-[12px]',
      // 成功是主题色 ok、失败是加粗红 fail；审计没有逐调用的退出码，用结果代替
      render: (item) =>
        item.OK ? (
          <span className="text-accent-ink">ok</span>
        ) : (
          <span className="font-semibold text-danger">fail</span>
        ),
    },
    {
      key: 'TokenName',
      title: '令牌',
      className: 'hidden w-[10rem] text-muted lg:table-cell',
      render: (item) => {
        const label = tokenLabel(item)
        return (
          <span className="block truncate" title={label}>
            {label}
          </span>
        )
      },
    },
    {
      key: 'DurationMS',
      title: '耗时',
      className: 'hidden w-[88px] text-right tabular-nums text-muted xl:table-cell',
      render: (item) => formatDuration(item.DurationMS),
    },
  ]

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Activity"
        title="活动留痕"
        subtitle="每次调用的结果与输出，失败同样留痕"
      />

      <Card className="overflow-hidden">
        {/* 检索栏即表格的标题栏：与表格同一张卡、一条分隔线（与主机/任务页同一套语言）。
            类型/结果这类列级维度收进列头漏斗，工具行只留全局搜索框 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5">
          <div className="ml-auto w-full sm:w-60">
            <label htmlFor="audit-filter-query" className="sr-only">
              搜索命令或参数
            </label>
            <Input
              pill
              id="audit-filter-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索命令、路径或参数…"
              spellCheck={false}
              prefix={<MagnifyingGlass size={14} />}
            />
          </div>
        </div>
        <DataTable
          // 固定布局：审计数据持续刷新，auto 布局下列宽随内容跳动、长命令会把时间/结果列挤变形；
          // 固定后列宽稳定，超长内容只在各自单元格内截断
          fixedLayout
          className={cn(
            'transition-opacity duration-150',
            audit.isPlaceholderData && 'opacity-60',
          )}
          columns={auditColumns}
          rows={rows}
          rowKey={(item) => item.ID}
          loading={audit.isLoading}
          onRowClick={setSelected}
          empty={
            filtered ? (
              <EmptyState
                className="[&_p]:text-balance"
                icon={<Pulse size={22} />}
                title="没有匹配的审计记录"
                description={
                  needle
                    ? '当前已加载的记录里没有匹配的命令或参数，调整关键词再试。'
                    : '当前筛选条件下暂无记录，调整条件再试。'
                }
              />
            ) : (
              <EmptyState
                className="[&_p]:text-balance"
                icon={<Pulse size={22} />}
                title="暂无审计记录"
                description="Agent 通过 MCP 网关调用工具后，每一次调用都会记录在这里。点开一行可看完整命令和参数。"
              />
            )
          }
        />
      </Card>

      <Sheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        title={selected?.Tool ?? '调用详情'}
        width="min(860px, 100vw)"
        header={
          selected ? (
            <div>
              <p className="truncate text-sm font-semibold text-text">{selected.Tool}</p>
              <p className="mt-0.5 truncate text-[12px] text-muted">
                {formatClock(selected.Ts)}
                {selected.Host?.Valid ? ` · ${selected.Host.String}` : ''}
              </p>
            </div>
          ) : undefined
        }
      >
        <div className="p-4 sm:p-5">{selected ? <AuditSheetContent item={selected} /> : null}</div>
      </Sheet>
    </PageTransition>
  )
}

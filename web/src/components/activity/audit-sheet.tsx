import { ArrowRight, Copy, Prohibit, TerminalWindow, WarningCircle } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import type { Audit } from '@/api/types'
import { OUTCOME_LABEL, OUTCOME_TONE } from '@/components/call-row'
import { ParamsList } from '@/components/command-run-detail'
import { CopyableBlock } from '@/components/copyable-block'
import { Pill, Tag } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton, useCopy } from '@/components/ui/code'
import { EmptyState } from '@/components/ui/empty-state'
import { KeyValues, Sheet, SheetSection } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { auditParamEntries, parseAuditParams } from '@/lib/audit'
import { callFromAudit } from '@/lib/calls'
import { formatBytes, formatDuration } from '@/lib/format'
import { staggerContainer, staggerItem } from '@/lib/motion'

const fullTime = (ms: number) => new Date(ms).toLocaleString('zh-CN', { hour12: false })

/**
 * 没有命令运行的审计条目（读文件、grep、记忆、被拒绝的调用……）的详情：
 * 由 ?audit=ID 驱动，可以直链。被拒绝的调用会解释「为什么被拦下」。
 */
export function AuditSheet({
  open,
  audit,
  loading,
  error,
  onClose,
}: {
  open: boolean
  audit: Audit | null | undefined
  loading: boolean
  error?: Error | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { copy } = useCopy()
  const call = audit ? callFromAudit(audit) : null
  const params = audit ? parseAuditParams(audit.ParamsJSON) : null
  const command = params && typeof params.command === 'string' ? params.command.trim() : ''
  const entries = audit ? auditParamEntries(audit) : []

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      width={560}
      title={audit ? <span className="font-mono text-[16px]">{audit.Tool}</span> : '调用详情'}
      status={
        call ? (
          <Pill tone={OUTCOME_TONE[call.outcome]} dot>
            {OUTCOME_LABEL[call.outcome]}
          </Pill>
        ) : undefined
      }
      meta={
        call ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Tag tone={call.outcome === 'denied' ? 'bad' : 'neutral'}>{call.outcome === 'denied' ? 'DENY' : call.tag}</Tag>
            <span>
              {call.token ?? '系统'}
              {call.host && ` → ${call.host}`}
            </span>
          </span>
        ) : undefined
      }
      actions={
        audit ? (
          <>
            <Button size="sm" onClick={() => void copy(JSON.stringify(params ?? {}, null, 2), '参数已复制')}>
              <Copy />
              复制参数
            </Button>
            {call?.host && !call.host.includes(',') && (
              <Button size="sm" onClick={() => navigate(`/terminal?host=${encodeURIComponent(call.host)}`)}>
                <TerminalWindow />
                在终端中打开
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {loading && !audit ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[120px] rounded-sheet-in" />
          <Skeleton className="h-[200px] rounded-sheet-in" />
        </div>
      ) : !audit || !call ? (
        <EmptyState icon={<WarningCircle />} title="找不到这条记录" description={error?.message ?? '它可能已经被清理。'} />
      ) : (
        <motion.div key={audit.ID} className="flex flex-col gap-2" variants={staggerContainer} initial="hidden" animate="visible">
          {call.outcome === 'denied' && (
            <motion.div variants={staggerItem}>
              <div className="flex gap-3 rounded-sheet-in bg-bad-soft px-3.5 py-3">
                <Prohibit size={18} weight="bold" className="mt-px shrink-0 text-bad" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-bad">网关拒绝了这次调用</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                    令牌「{call.token ?? '未知'}」
                    {call.host ? `没有访问 ${call.host} 的授权，或 ${audit.Tool} 所在的工具组已被禁用。` : `调用的 ${audit.Tool} 所在工具组已被禁用。`}
                    请求没有到达主机，凭据也没有离开网关。
                  </p>
                  <Button size="sm" variant="ghost" className="-ml-2 mt-1.5 text-bad hover:bg-bad-soft hover:text-bad" onClick={() => navigate('/tokens')}>
                    查看令牌权限
                    <ArrowRight />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {(command || call.summary) && (
            <motion.div variants={staggerItem}>
              <SheetSection title={command ? '命令' : '摘要'}>
                <CopyableBlock value={command || call.summary} label={command ? '命令' : '摘要'} prompt={command ? '$' : undefined} />
              </SheetSection>
            </motion.div>
          )}

          <motion.div variants={staggerItem}>
            <SheetSection title="调用信息">
              <KeyValues
                items={[
                  { label: '令牌', value: call.token ?? <span className="text-ink-3">系统</span> },
                  { label: '主机', value: call.host || '—', mono: !!call.host },
                  { label: '工具', value: audit.Tool, mono: true },
                  { label: '耗时', value: call.outcome === 'denied' ? '—' : formatDuration(audit.DurationMS), mono: true },
                  { label: '输出', value: audit.BytesOut ? formatBytes(audit.BytesOut) : '—', mono: true },
                  ...(audit.ExitCode?.Valid ? [{ label: '退出码', value: String(audit.ExitCode.Int64), mono: true }] : []),
                  { label: '时间', value: fullTime(audit.Ts) },
                  {
                    label: '审计 ID',
                    value: (
                      <span className="inline-flex items-center gap-1">
                        #{audit.ID}
                        <CopyButton value={String(audit.ID)} label="复制审计 ID" className="size-6" />
                      </span>
                    ),
                    mono: true,
                  },
                ]}
              />
            </SheetSection>
          </motion.div>

          <motion.div variants={staggerItem}>
            <SheetSection title="参数" sub={entries.length ? `${entries.length} 项` : undefined}>
              {entries.length > 0 ? (
                <ParamsList entries={entries} />
              ) : (
                <p className="text-[12.5px] text-ink-3">
                  {call.outcome === 'denied' ? '被拒绝的调用不记录参数。' : '此次调用没有记录额外参数。'}
                </p>
              )}
            </SheetSection>
          </motion.div>

          {call.runIds.length > 0 && (
            <motion.div variants={staggerItem}>
              <SheetSection title="命令运行">
                <div className="flex flex-col gap-1">
                  {call.runIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => navigate(`/activity/${id}?audit=${audit.ID}`)}
                      className="flex items-center gap-2 rounded-[9px] px-2.5 py-2 text-left font-mono text-[12px] transition-colors hover:bg-hover-2"
                    >
                      {id}
                      <ArrowRight size={13} className="ml-auto text-ink-3" />
                    </button>
                  ))}
                </div>
              </SheetSection>
            </motion.div>
          )}
        </motion.div>
      )}
    </Sheet>
  )
}

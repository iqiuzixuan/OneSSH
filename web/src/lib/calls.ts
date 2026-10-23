import type { StreamEventItem } from '@/api/live'
import type { Audit, Host, Metric, ToolCallEventData } from '@/api/types'
import { auditSummary } from './audit'

/** 工具类别短签：活动流与概览共用，与后端 toolgroups 的分组一致 */
export type ToolTag = 'EXEC' | 'FILE' | 'GREP' | 'JOB' | 'MEMORY' | 'STAT' | 'HOST' | 'OUT' | string

export function toolTag(tool: string): ToolTag {
  if (/^exec|^session_env/.test(tool)) return 'EXEC'
  if (/^file|^sftp|^image_view/.test(tool)) return 'FILE'
  if (/grep|search|^find/.test(tool)) return 'GREP'
  if (/^job/.test(tool)) return 'JOB'
  if (/^memory/.test(tool)) return 'MEMORY'
  if (/^host_status/.test(tool)) return 'STAT'
  if (/^host|^hosts/.test(tool)) return 'HOST'
  if (/^output/.test(tool)) return 'OUT'
  return tool.toUpperCase().slice(0, 6)
}

/** 一次调用的结果：成功、执行失败、被网关拒绝——三者对使用者的含义完全不同 */
export type Outcome = 'ok' | 'failed' | 'denied'

/**
 * 归一化后的一次调用：实时事件（SSE tool_call）与审计记录（GET /audit）都转成它，
 * 概览动态、活动流、主机详情的「最近调用」共用同一套渲染。
 */
export type CallItem = {
  /** 稳定 key：有审计 id 用审计 id，否则用客户端序号 */
  key: string
  auditId?: number
  ts: number
  token?: string
  tokenId?: number
  tool: string
  tag: ToolTag
  host: string
  summary: string
  outcome: Outcome
  durationMs: number
  exitCode?: number | null
  runIds: string[]
}

export function outcomeOf(ok: boolean, denied?: boolean): Outcome {
  if (denied) return 'denied'
  return ok ? 'ok' : 'failed'
}

export function callFromEvent(event: StreamEventItem): CallItem | null {
  if (event.type !== 'tool_call' || !event.data || typeof event.data !== 'object') return null
  const d = event.data as ToolCallEventData
  return {
    key: d.id != null ? `a${d.id}` : `e${event.seq}`,
    auditId: d.id,
    ts: event.ts,
    token: d.token_name,
    tokenId: d.token_id,
    tool: d.tool,
    tag: toolTag(d.tool),
    host: d.host ?? '',
    summary: d.summary || d.tool,
    outcome: outcomeOf(d.ok, d.denied),
    durationMs: d.duration_ms ?? 0,
    exitCode: d.exit_code,
    runIds: d.run_ids ?? [],
  }
}

export function callFromAudit(a: Audit): CallItem {
  return {
    key: `a${a.ID}`,
    auditId: a.ID,
    ts: a.Ts,
    token: a.TokenName?.Valid ? a.TokenName.String : undefined,
    tokenId: a.TokenID?.Valid ? a.TokenID.Int64 : undefined,
    tool: a.Tool,
    tag: toolTag(a.Tool),
    host: a.Host?.Valid ? a.Host.String : '',
    // 工具组被禁用的拒绝没有参数可摘要，至少说清是哪个工具被拦下
    summary: auditSummary(a) || (a.Denied ? `${a.Tool} · 工具组已禁用` : a.Tool),
    outcome: outcomeOf(a.OK, a.Denied),
    durationMs: a.DurationMS,
    exitCode: a.ExitCode?.Valid ? a.ExitCode.Int64 : null,
    runIds: a.RunIDs ?? [],
  }
}

/** 把实时事件与审计列表合并去重（同一审计 id 只留一条），按时间倒序 */
export function mergeCalls(live: CallItem[], audits: CallItem[], limit = 100): CallItem[] {
  const seen = new Set<string>()
  const out: CallItem[] = []
  for (const item of [...live, ...audits].sort((a, b) => b.ts - a.ts)) {
    if (seen.has(item.key)) continue
    seen.add(item.key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

/* ── 主机状态 ─────────────────────────────────────────────────────── */

export type HostState = 'online' | 'offline' | 'sampling' | 'unknown'

/**
 * 主机的可见状态，按可信度依次取：连接池结论（health）> 最近 3 分钟内有采样 > 未知。
 * sampling = 开了监控但还没有任何结论（刚启动 / 刚加进来）。
 */
export function hostState(host: Host, latest?: Metric): HostState {
  if (host.health?.state === 'online') return 'online'
  if (host.health?.state === 'offline') return 'offline'
  if (latest && Date.now() - latest.ts < 3 * 60_000) return 'online'
  if (host.monitor_enabled) return 'sampling'
  return 'unknown'
}

export const HOST_STATE_LABEL: Record<HostState, string> = {
  online: '在线',
  offline: '离线',
  sampling: '待采样',
  unknown: '未连接',
}

export function memPct(metric?: Metric): number | null {
  if (!metric?.mem_total_kb || metric.mem_used_kb == null) return null
  return (metric.mem_used_kb / metric.mem_total_kb) * 100
}

import type { Audit } from '@/api/types'

/** 把审计里存的 params_json 解成对象；坏 JSON 不当成崩溃，调用方按空参数处理 */
export function parseAuditParams(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * 后端审计会把正文类参数脱敏：content / edits 记成 `<len=N>`（N 为 JSON 编码后的字节数），
 * password 记成 `<redacted>`。这里把它们翻成人话，列表与详情都不再露出占位串。
 */
export function describeRedacted(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value === '<redacted>') return '已脱敏'
  const match = /^<len=(\d+)>$/.exec(value)
  return match ? `已脱敏 · ${match[1]} 字节` : null
}

function redactedBytes(params: Record<string, unknown>, key: string): number | null {
  const value = params[key]
  const match = typeof value === 'string' ? /^<len=(\d+)>$/.exec(value) : null
  return match ? Number(match[1]) : null
}

function textField(params: Record<string, unknown>, key: string): string {
  const value = params[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 从一次调用的参数里抽出人能扫一眼的摘要：exec / job_start 用 command，
 * 文件操作用 path，grep/find 带上 pattern。和后端 callSummary 保持同一优先序。
 */
export function auditSummary(item: Pick<Audit, 'ParamsJSON'> & { Tool?: string }): string {
  const params = parseAuditParams(item.ParamsJSON)
  if (!params) return ''

  // 记忆写入只有被脱敏的正文：说「写了多少」比露出 <len=76> 有用
  const contentBytes = redactedBytes(params, 'content')
  if (item.Tool?.startsWith('memory_') && contentBytes != null) {
    const verb = item.Tool === 'memory_update' ? '更新记忆' : '写入记忆'
    return `${verb} · ${contentBytes} 字节`
  }

  const command = textField(params, 'command')
  if (command) return command

  const path = textField(params, 'path')
  const pattern = textField(params, 'pattern')
  if (path && pattern) return `${pattern}  ${path}`
  if (path) return path

  const src = textField(params, 'src_path')
  const dst = textField(params, 'dst_path')
  if (src && dst) return `${src} → ${dst}`
  if (src) return src

  for (const key of ['query', 'pattern', 'content', 'job_id', 'artifact_id'] as const) {
    const value = textField(params, key)
    if (value) return describeRedacted(value) ?? value
  }
  return ''
}

export function formatAuditParam(value: unknown): string {
  const redacted = describeRedacted(value)
  if (redacted) return redacted
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** command 已单独成块展示，参数条目里跳过；空值一并过滤 */
export function auditParamEntries(item: Pick<Audit, 'ParamsJSON'>): [string, unknown][] {
  const params = parseAuditParams(item.ParamsJSON)
  if (!params) return []
  const command = typeof params.command === 'string' ? params.command.trim() : ''
  return Object.entries(params).filter(
    ([key, value]) => !(key === 'command' && command) && value != null && value !== '',
  )
}

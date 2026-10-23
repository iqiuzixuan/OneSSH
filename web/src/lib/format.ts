/** 字节数人类可读 */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(2)} GB`
}

/** 后端「秒」级时间戳（主机 / 密钥 / 令牌的 created_at）转本地时间 */
export function formatTime(unixSec: number) {
  return new Date(unixSec * 1000).toLocaleString('zh-CN', { hour12: false })
}

/** 「秒」级时间戳只取日期 */
export function formatDate(unixSec: number) {
  const d = new Date(unixSec * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 百分比，缺值显破折号 */
export function formatPct(v: number | null | undefined, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v.toFixed(digits)}%`
}

/** 审计、SSE、命令运行的时间戳是「毫秒」 */
export function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })
}

/** 耗时：412 ms / 1.82 s / 2m 24s / 5h 36m —— 量级一眼可辨，列宽也稳定 */
export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
  return `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`
}

/** 相对时间（毫秒时间戳）：刚刚 / 12 秒前 / 4 分钟前 / 2 小时前 / 3 天前 */
export function formatAgo(ms: number, now = Date.now()) {
  const d = Math.max(0, now - ms)
  if (d < 5_000) return '刚刚'
  if (d < 60_000) return `${Math.floor(d / 1000)} 秒前`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`
  return `${Math.floor(d / 86_400_000)} 天前`
}

/** 运行时长：2 天 4 时 / 3 时 12 分 / 12 分 */
export function formatUptime(ms: number) {
  const m = Math.floor(ms / 60_000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d} 天 ${h % 24} 时`
  if (h > 0) return `${h} 时 ${m % 60} 分`
  return `${m} 分`
}

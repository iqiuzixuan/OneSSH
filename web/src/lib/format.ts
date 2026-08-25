/** 字节数人类可读（沿用旧 App.tsx 的分档逻辑） */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / 1048576).toFixed(1)} MiB`
}

/** 后端时间戳统一为「秒」，与 JS 的毫秒差一个量级——集中转换避免各页面漏乘 1000 */
export function formatTime(unixSec: number) {
  return new Date(unixSec * 1000).toLocaleString()
}

/** 百分比，缺值显破折号 */
export function formatPct(v: number | null | undefined, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v.toFixed(digits)}%`
}

/** 审计与 SSE 事件流的时间戳是「毫秒」，与 formatTime 的「秒」契约不同，故单列 */
export function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })
}

/** 四位数以上的毫秒既难读又撑宽列，统一在 1s 处进位 */
export function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`
}

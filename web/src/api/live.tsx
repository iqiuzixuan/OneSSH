import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { StreamEvent } from './types'

/** 连接状态要诚实地暴露给 UI：SSE 断了就显示断了，而不是一直亮着绿点 */
export type StreamStatus = 'connecting' | 'open' | 'error'

/**
 * 服务端事件没有统一的唯一 id，而事件是往列表头部插入的——用数组下标当 key 会让
 * 每来一条新事件后全部旧事件的 key 错位，React 复用错节点、入场动画重放。
 * 这里补一个客户端自增序号作为稳定 key。
 */
export type StreamEventItem = StreamEvent & { seq: number }

type Snapshot = { events: StreamEventItem[]; status: StreamStatus }
type Listener = (event: StreamEventItem) => void

const BUFFER = 300
/** 失效节流窗口：Agent 一秒内连发十几次调用时，列表最多每秒重拉一次 */
const INVALIDATE_MS = 1000

/** 每类事件会让哪些查询过期；前缀匹配，筛选条件不同的缓存一并失效 */
const INVALIDATES: Record<string, readonly (readonly unknown[])[]> = {
  tool_call: [['audit'], ['overview']],
  command_started: [['command-runs'], ['overview']],
  command_finished: [['command-runs'], ['overview'], ['jobs']],
  command_job_linked: [['jobs']],
  job_status: [['jobs'], ['overview']],
}

/**
 * 整个控制台只开一条 EventSource：多个页面各开一条会让同一事件被重复处理，
 * 还会占满浏览器对同源 HTTP/1.1 的 6 条连接上限。
 */
class LiveStore {
  private snapshot: Snapshot = { events: [], status: 'connecting' }
  private subscribers = new Set<() => void>()
  private listeners = new Set<Listener>()
  private source: EventSource | null = null
  private seq = 0
  private pending = new Map<string, readonly unknown[]>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly queryClient: QueryClient) {}

  /**
   * 页面隐藏（跳转、刷新、进入往返缓存）时主动断开，被往返缓存恢复时重连。
   * 否则冻结在 bfcache 里的旧页面会一直占着这条长连接——同源 HTTP/1.1 只有 6 条，
   * 刷新几次之后新的请求和导航就只能排队。
   */
  private onPageHide = () => this.disconnect()
  private onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) this.open()
  }

  connect() {
    window.addEventListener('pagehide', this.onPageHide)
    window.addEventListener('pageshow', this.onPageShow)
    this.open()
  }

  close() {
    window.removeEventListener('pagehide', this.onPageHide)
    window.removeEventListener('pageshow', this.onPageShow)
    this.disconnect()
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
  }

  private disconnect() {
    this.source?.close()
    this.source = null
    this.setStatus('connecting')
  }

  private open() {
    if (this.source) return
    const source = new EventSource('/api/v1/events')
    this.source = source
    source.onopen = () => this.setStatus('open')
    // EventSource 自带断线重连；onerror 后仍处于 CONNECTING 只是短暂抖动，不该报「已断开」
    source.onerror = () => this.setStatus(source.readyState === EventSource.CLOSED ? 'error' : 'connecting')
    source.onmessage = (message) => {
      let parsed: StreamEvent
      try {
        parsed = JSON.parse(message.data) as StreamEvent
      } catch {
        return
      }
      // 逐块输出太碎，不进事件缓冲，只交给订阅者（命令详情的实时输出用）
      const item: StreamEventItem = { ...parsed, seq: ++this.seq }
      if (parsed.type !== 'command_output') {
        this.snapshot = { ...this.snapshot, events: [item, ...this.snapshot.events].slice(0, BUFFER) }
        this.emit()
      }
      for (const listener of this.listeners) listener(item)
      this.scheduleInvalidate(parsed.type)
    }
  }

  subscribe = (callback: () => void) => {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  getSnapshot = () => this.snapshot

  /** 逐条事件回调（不经 React 渲染），流量带的光点动画、新事件高亮用它 */
  listen(listener: Listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private setStatus(status: StreamStatus) {
    if (this.snapshot.status === status) return
    this.snapshot = { ...this.snapshot, status }
    this.emit()
  }

  private emit() {
    for (const callback of this.subscribers) callback()
  }

  private scheduleInvalidate(type: string) {
    for (const key of INVALIDATES[type] ?? []) this.pending.set(JSON.stringify(key), key)
    if (this.pending.size === 0 || this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      const keys = [...this.pending.values()]
      this.pending.clear()
      for (const queryKey of keys) void this.queryClient.invalidateQueries({ queryKey })
    }, INVALIDATE_MS)
  }
}

const LiveContext = createContext<LiveStore | null>(null)

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const store = useMemo(() => new LiveStore(queryClient), [queryClient])
  useEffect(() => {
    store.connect()
    return () => store.close()
  }, [store])
  return <LiveContext.Provider value={store}>{children}</LiveContext.Provider>
}

function useLiveStore() {
  const store = useContext(LiveContext)
  if (!store) throw new Error('useLive 必须在 LiveProvider 内使用')
  return store
}

/** 最近的实时事件（新在前）与连接状态 */
export function useLive(): Snapshot {
  const store = useLiveStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

/** 逐条订阅事件；回调里不要做重渲染，适合驱动动画 */
export function useLiveListener(listener: Listener) {
  const store = useLiveStore()
  useEffect(() => store.listen(listener), [store, listener])
}

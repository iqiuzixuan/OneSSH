import { animate, useReducedMotion } from 'motion/react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useLiveListener, type StreamEventItem } from '@/api/live'
import { LogoGlyph } from '@/components/brand/logo'
import { Dot, Initials } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Num } from '@/components/ui/number'
import { callFromEvent, type CallItem, type HostState } from '@/lib/calls'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

export type FlowAgent = { key: string; name: string; calls: number; quiet: boolean }
export type FlowHost = { id: number; name: string; state: HostState; cpu: number | null }

type Paths = { agents: { name: string; d: string }[]; hosts: { name: string; d: string; dead: boolean }[] }

const SVG_NS = 'http://www.w3.org/2000/svg'
const TRAIL = [
  { r: 2.6, opacity: 1 },
  { r: 1.9, opacity: 0.45 },
  { r: 1.3, opacity: 0.2 },
]

/** 三次贝塞尔：水平出、水平进，中段柔和过渡 */
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = (x2 - x1) * 0.55
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}

/**
 * 流量带：概览的招牌。左边是 Agent（令牌），中间是网关，右边是主机。
 * 每个实时 tool_call 事件化作一颗带拖尾的光点从 Agent 沿曲线流进网关，再流向目标主机；
 * 被拒绝的调用停在网关处变红、扩散消失，旁边短暂浮出「拒绝 · 谁 → 哪」。
 *
 * 光点是命令式 SVG：每秒可能有十几颗，走 React 渲染会让整张卡片反复 diff。
 * 曲线路径随容器尺寸重新计算（ResizeObserver），宽度变化时不会错位。
 */
export function FlowStrip({
  agents,
  hosts,
  hiddenHosts,
  rate,
  deniedHour,
  onHostClick,
}: {
  agents: FlowAgent[]
  hosts: FlowHost[]
  /** 列不下而折叠的主机数 */
  hiddenHosts: number
  /** 最近一分钟调用数 */
  rate: number
  deniedHour: number
  onHostClick: (id: number) => void
}) {
  const reduced = useReducedMotion()
  const body = useRef<HTMLDivElement>(null)
  const gw = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLSpanElement>(null)
  const deny = useRef<HTMLDivElement>(null)
  const dots = useRef<SVGGElement>(null)
  const pathEls = useRef(new Map<string, SVGPathElement>())
  const [paths, setPaths] = useState<Paths>({ agents: [], hosts: [] })
  const [box, setBox] = useState({ w: 0, h: 0 })

  const agentKeys = agents.map((a) => a.name).join('|')
  const hostKeys = hosts.map((h) => `${h.name}:${h.state === 'offline'}`).join('|')

  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const layout = () => {
      const br = el.getBoundingClientRect()
      const g = gw.current?.getBoundingClientRect()
      if (!br.width || !g) return
      const gx1 = g.left - br.left
      const gx2 = g.right - br.left
      const gy = g.top - br.top + g.height / 2
      const agentEls = [...el.querySelectorAll<HTMLElement>('[data-agent]')]
      const hostEls = [...el.querySelectorAll<HTMLElement>('[data-host]')]
      setBox({ w: br.width, h: br.height })
      setPaths({
        // 进网关的端点略微错开，多条线汇入时像一束而不是一个点
        agents: agentEls.map((c, i) => {
          const r = c.getBoundingClientRect()
          return {
            name: c.dataset.agent!,
            d: curve(r.right - br.left, r.top - br.top + r.height / 2, gx1, gy + (i - (agentEls.length - 1) / 2) * 7),
          }
        }),
        hosts: hostEls.map((c, i) => {
          const r = c.getBoundingClientRect()
          return {
            name: c.dataset.host!,
            dead: c.dataset.off === 'true',
            d: curve(gx2, gy + (i - (hostEls.length - 1) / 2) * 5, r.left - br.left, r.top - br.top + r.height / 2),
          }
        }),
      })
    }
    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(el)
    return () => observer.disconnect()
  }, [agentKeys, hostKeys])

  const heat = useCallback((path?: SVGPathElement) => {
    if (!path) return
    path.dataset.hot = ''
    window.clearTimeout(Number(path.dataset.timer))
    path.dataset.timer = String(window.setTimeout(() => delete path.dataset.hot, 420))
  }, [])

  const ping = useCallback((selector: string) => {
    const el = body.current?.querySelector<HTMLElement>(selector)
    if (!el) return
    el.dataset.ping = ''
    window.setTimeout(() => delete el.dataset.ping, 160)
  }, [])

  const pulseGateway = useCallback(
    (bad: boolean) => {
      const el = ring.current
      if (!el || reduced) return
      el.dataset.bad = bad ? 'true' : 'false'
      animate(el, { opacity: [bad ? 0.9 : 0.5, 0], scale: [1, bad ? 1.32 : 1.18] }, { duration: bad ? 0.7 : 0.55, ease: 'easeOut' })
    },
    [reduced],
  )

  const showDeny = useCallback((call: CallItem) => {
    const el = deny.current
    if (!el) return
    el.textContent = `拒绝 · ${call.token ?? '未知令牌'}${call.host ? ` → ${call.host}` : ''}`
    animate(el, { opacity: 1, y: [4, 0] }, spring.snap)
    window.clearTimeout(Number(el.dataset.timer))
    el.dataset.timer = String(window.setTimeout(() => animate(el, { opacity: 0 }, { duration: 0.4 }), 1800))
  }, [])

  const shoot = useCallback(
    (call: CallItem) => {
      const layer = dots.current
      if (!layer || document.hidden) return
      const agentPath = call.token ? pathEls.current.get(`a:${call.token}`) : undefined
      // exec_many 的 host 是逗号拼接的多台，光点只走第一台
      const hostPath = call.host ? pathEls.current.get(`h:${call.host.split(',')[0].trim()}`) : undefined
      if (call.token) ping(`[data-agent="${CSS.escape(call.token)}"]`)
      heat(agentPath)

      if (reduced) {
        if (call.outcome === 'denied') showDeny(call)
        else if (hostPath) ping(`[data-host="${CSS.escape(call.host.split(',')[0].trim())}"]`)
        return
      }

      const circles = TRAIL.map(({ r, opacity }) => {
        const c = document.createElementNS(SVG_NS, 'circle')
        c.setAttribute('r', String(r))
        c.setAttribute('opacity', String(opacity))
        c.setAttribute('fill', 'var(--ink)')
        layer.append(c)
        return c
      })
      const place = (path: SVGPathElement, length: number, v: number) =>
        circles.forEach((c, i) => {
          const p = path.getPointAtLength(Math.min(1, Math.max(0, v - i * 0.035)) * length)
          c.setAttribute('cx', String(p.x))
          c.setAttribute('cy', String(p.y))
        })
      const gwCenter = () => {
        const br = body.current!.getBoundingClientRect()
        const g = gw.current!.getBoundingClientRect()
        return { x: g.left - br.left + g.width / 2, y: g.top - br.top + g.height / 2 }
      }
      const ease = [0.45, 0, 0.25, 1] as const

      const toHost = () => {
        if (call.outcome === 'denied' || !hostPath) {
          // 停在网关：拒绝的变红扩散；去向不明的（主机不在列表里）静静淡出
          const bad = call.outcome === 'denied'
          pulseGateway(bad)
          if (bad) showDeny(call)
          circles.slice(1).forEach((c) => c.remove())
          const head = circles[0]
          if (bad) head.setAttribute('fill', 'var(--bad)')
          void animate(0, 1, {
            duration: 0.65,
            ease: 'easeOut',
            onUpdate: (v) => {
              head.setAttribute('r', String(2.6 + v * (bad ? 13 : 4)))
              head.setAttribute('opacity', String(1 - v))
            },
          }).then(() => head.remove())
          return
        }
        pulseGateway(false)
        heat(hostPath)
        const length = hostPath.getTotalLength()
        void animate(0, 1, { duration: 0.8, ease, onUpdate: (v) => place(hostPath, length, v) }).then(() => {
          ping(`[data-host="${CSS.escape(call.host.split(',')[0].trim())}"]`)
          void animate(1, 0, {
            duration: 0.25,
            onUpdate: (v) => circles.forEach((c, i) => c.setAttribute('opacity', String(v * TRAIL[i].opacity))),
          }).then(() => circles.forEach((c) => c.remove()))
        })
      }

      if (agentPath) {
        const length = agentPath.getTotalLength()
        place(agentPath, length, 0)
        void animate(0, 1, { duration: 0.85, ease, onUpdate: (v) => place(agentPath, length, v) }).then(toHost)
      } else {
        // 令牌没在左列（列不下或已删除）：光点从网关处冒出
        const { x, y } = gwCenter()
        circles.forEach((c) => {
          c.setAttribute('cx', String(x))
          c.setAttribute('cy', String(y))
        })
        toHost()
      }
    },
    [heat, ping, pulseGateway, reduced, showDeny],
  )

  useLiveListener(
    useCallback(
      (event: StreamEventItem) => {
        const call = callFromEvent(event)
        if (call) shoot(call)
      },
      [shoot],
    ),
  )

  return (
    <Card className="overflow-hidden p-1.5">
      <div className="flex items-start justify-between gap-4 px-3 pt-2.5 pb-0.5">
        <div>
          <h2 className="text-[13px] font-semibold">流量</h2>
          <p className="mt-0.5 text-[12px] text-ink-3">每颗光点是一次 MCP 调用：Agent → 网关 → 主机。越权的调用停在网关。</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-[18px] text-[12px] text-ink-3">
          <span>
            <b className="mr-[3px] text-[15px] font-medium text-ink">
              <Num value={rate} />
            </b>
            次 / 分钟
          </span>
          <span>
            <b className={cn('mr-[3px] text-[15px] font-medium', deniedHour > 0 ? 'text-bad' : 'text-ink')}>
              <Num value={deniedHour} />
            </b>
            次拒绝 · 1 小时
          </span>
        </div>
      </div>

      <div
        ref={body}
        className={cn(
          'relative mt-1 grid h-[268px] items-center rounded-well bg-well px-2 shadow-well',
          'grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] lg:grid-cols-[176px_1fr_104px_1fr_176px] xl:grid-cols-[196px_1fr_124px_1fr_196px]',
          'bg-[radial-gradient(circle_at_1px_1px,var(--line)_1px,transparent_0)] bg-[length:16px_16px]',
        )}
      >
        <svg
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          viewBox={box.w ? `0 0 ${box.w} ${box.h}` : undefined}
          aria-hidden
        >
          <g fill="none" strokeWidth={1}>
            {paths.agents.map((p) => (
              <path
                key={`a:${p.name}`}
                ref={(el) => void (el ? pathEls.current.set(`a:${p.name}`, el) : pathEls.current.delete(`a:${p.name}`))}
                d={p.d}
                className="stroke-[var(--path)] [transition:stroke_1.1s_var(--ease-out)] data-[hot]:stroke-[var(--path-hot)] data-[hot]:[transition:stroke_.15s]"
              />
            ))}
            {paths.hosts.map((p) => (
              <path
                key={`h:${p.name}`}
                ref={(el) => void (el ? pathEls.current.set(`h:${p.name}`, el) : pathEls.current.delete(`h:${p.name}`))}
                d={p.d}
                strokeDasharray={p.dead ? '2 4' : undefined}
                className="stroke-[var(--path)] [transition:stroke_1.1s_var(--ease-out)] data-[hot]:stroke-[var(--path-hot)] data-[hot]:[transition:stroke_.15s]"
              />
            ))}
          </g>
          <g ref={dots} />
        </svg>

        <div className="relative z-[1] col-start-1 flex flex-col gap-1.5">
          {agents.length === 0 && <p className="px-2 text-[12px] text-ink-3">还没有 Agent 调用过网关</p>}
          {agents.map((agent) => (
            <div
              key={agent.key}
              data-agent={agent.name}
              className={cn(
                'flex h-[30px] items-center gap-2 rounded-[9px] bg-surface pr-2.5 pl-[5px] shadow-card',
                'transition-[background-color,opacity] duration-[900ms] ease-[var(--ease-out)] data-[ping]:bg-well-2 data-[ping]:duration-0',
                agent.quiet && 'opacity-55',
              )}
            >
              <Initials name={agent.name} className="size-5 rounded-[6px] text-[9.5px] shadow-none" />
              <span className="truncate text-[12.5px] font-medium">{agent.name}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">
                <Num value={agent.calls} />
              </span>
            </div>
          ))}
        </div>

        <div className="relative z-[1] col-start-2 flex flex-col items-center gap-2.5 lg:col-start-3">
          <div ref={gw} className="relative grid size-[76px] place-items-center rounded-[22px] bg-surface shadow-raise">
            <LogoGlyph className="size-[34px] text-ink" />
            <span
              ref={ring}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[22px] opacity-0 shadow-[0_0_0_1.5px_var(--ink-3)] data-[bad=true]:shadow-[0_0_0_1.5px_var(--bad)]"
            />
          </div>
          <div className="text-center text-[12.5px] leading-tight font-semibold tracking-[-0.01em]">
            OneSSH
            <small className="block text-[11px] font-normal text-ink-3">凭据不出网关</small>
          </div>
          <div
            ref={deny}
            aria-live="polite"
            className={cn(
              'absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 rounded-[7px] bg-surface px-2 py-1 font-mono text-[11px] font-medium text-bad opacity-0 shadow-card',
              // 窄屏中间列只有 96px，左右两列紧贴着芯片——标签允许换行，宽度不越出网关列太多
              'w-max max-w-[128px] text-center break-all lg:max-w-none lg:whitespace-nowrap',
            )}
          />
        </div>

        <div className="relative z-[1] col-start-3 flex flex-col gap-0.5 lg:col-start-5">
          {hosts.length === 0 && <p className="px-2 text-[12px] text-ink-3">还没有主机</p>}
          {hosts.map((host) => (
            <button
              key={host.id}
              type="button"
              data-host={host.name}
              data-off={host.state === 'offline'}
              onClick={() => onHostClick(host.id)}
              className={cn(
                'flex h-[22px] items-center gap-2 rounded-[7px] px-2 text-left',
                'transition-[background-color,box-shadow] duration-1000 ease-[var(--ease-out)] hover:bg-hover-2 hover:duration-150',
                'data-[ping]:bg-surface data-[ping]:shadow-card data-[ping]:duration-0',
              )}
            >
              <Dot
                tone={host.state === 'online' ? 'ok' : host.state === 'offline' ? 'bad' : 'neutral'}
                idle={host.state === 'unknown'}
              />
              <span className={cn('truncate font-mono text-[12px]', host.state === 'offline' ? 'text-ink-3' : 'text-ink')}>
                {host.name}
              </span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">
                {host.state === 'offline' ? '离线' : host.cpu != null ? `${Math.round(host.cpu)}%` : '—'}
              </span>
            </button>
          ))}
          {hiddenHosts > 0 && <p className="px-2 pt-0.5 font-mono text-[11px] text-ink-3">+{hiddenHosts} 台</p>}
        </div>
      </div>
    </Card>
  )
}

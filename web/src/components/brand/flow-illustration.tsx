import { useReducedMotion } from 'motion/react'
import { useId } from 'react'
import { cn } from '@/lib/cn'

/**
 * 登录页的示意流量带：概览「流量带」的静态缩影，用来在登录前就讲清 OneSSH 做什么——
 * Agent 的每次调用都先经过网关，再到达主机；越权的那一次停在网关、变红。
 *
 * 登录前拿不到任何真实数据，所以名字都是示意。光点用 SVG 声明式动画（animateMotion），
 * 不占用 JS 帧；所有光点同一周期，靠 begin 错开，网关的红色涟漪与拒绝光点同步。
 * 降低动效时只保留静态线条与节点。
 */
const AGENTS = [
  { name: 'Claude Code', y: 72 },
  { name: 'Codex CLI', y: 122 },
  { name: 'Cursor', y: 172 },
]
const HOSTS = [
  { name: 'web-01', y: 62 },
  { name: 'web-02', y: 92 },
  { name: 'db-01', y: 122 },
  { name: 'gpu-01', y: 152 },
  { name: 'ci-runner', y: 182 },
]
const GW = { x: 196, y: 122, r: 30 }
const AGENT_X = 128 // 芯片右缘
const HOST_X = 268 // 主机名左侧圆点

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = (x2 - x1) * 0.55
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}
const inPath = (i: number) => curve(AGENT_X, AGENTS[i].y, GW.x - GW.r, GW.y + (i - 1) * 6)
const outPath = (j: number) => curve(GW.x + GW.r, GW.y + (j - 2) * 4, HOST_X - 8, HOSTS[j].y)
/** 一颗光点的完整路线：进网关 → 穿过网关（被网关块盖住）→ 出网关到主机 */
const route = (i: number, j: number) =>
  `${inPath(i)} L${GW.x + GW.r},${GW.y + (j - 2) * 4} ${outPath(j).replace(/^M[^C]+/, '')}`

const PERIOD = 3.6
/** 每条路线：哪个 Agent → 哪台主机，何时出发；denied 的停在网关 */
const SHOTS = [
  { agent: 0, host: 0, begin: 0 },
  { agent: 1, host: 2, begin: 0.9 },
  { agent: 2, host: -1, begin: 1.8, denied: true },
  { agent: 0, host: 3, begin: 2.7 },
]

export function FlowIllustration({ className }: { className?: string }) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 44 360 152" className={cn('block w-full', className)} role="img" aria-label="示意：Agent 的调用经过 OneSSH 网关到达主机，越权调用被网关拦下">
      <g fill="none" stroke="var(--path)" strokeWidth={1}>
        {AGENTS.map((_, i) => (
          <path key={`a${i}`} d={inPath(i)} />
        ))}
        {HOSTS.map((_, j) => (
          <path key={`h${j}`} d={outPath(j)} />
        ))}
      </g>

      {!reduced &&
        SHOTS.map((shot, k) => {
          const id = `${uid}-r${k}`
          const d = shot.denied ? inPath(shot.agent) : route(shot.agent, shot.host)
          // 行进占周期的前一段，然后停在终点并淡出；拒绝的走得短，所以停得早
          const travel = shot.denied ? 0.34 : 0.62
          return (
            <g key={k}>
              <path id={id} d={d} fill="none" stroke="none" />
              {[2.4, 1.6].map((r, t) => (
                <circle key={t} r={r} fill={shot.denied ? 'var(--bad)' : 'var(--ink)'} opacity={0}>
                  <animateMotion
                    dur={`${PERIOD}s`}
                    begin={`${shot.begin + t * 0.07}s`}
                    repeatCount="indefinite"
                    keyPoints="0;1;1"
                    keyTimes={`0;${travel};1`}
                    calcMode="spline"
                    keySplines=".45 0 .25 1;0 0 1 1"
                  >
                    <mpath href={`#${id}`} />
                  </animateMotion>
                  <animate
                    attributeName="opacity"
                    dur={`${PERIOD}s`}
                    begin={`${shot.begin + t * 0.07}s`}
                    repeatCount="indefinite"
                    values={`0;${t ? 0.4 : 1};${t ? 0.4 : 1};0;0`}
                    keyTimes={`0;0.04;${travel};${travel + 0.05};1`}
                  />
                </circle>
              ))}
              {shot.denied && (
                <rect
                  x={GW.x - GW.r}
                  y={GW.y - GW.r}
                  width={GW.r * 2}
                  height={GW.r * 2}
                  rx={18}
                  fill="none"
                  stroke="var(--bad)"
                  strokeWidth={1.5}
                  opacity={0}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                >
                  <animate
                    attributeName="opacity"
                    dur={`${PERIOD}s`}
                    begin={`${shot.begin}s`}
                    repeatCount="indefinite"
                    values="0;0;0.9;0;0"
                    keyTimes={`0;${travel};${travel + 0.02};${travel + 0.22};1`}
                  />
                  <animateTransform
                    attributeName="transform"
                    type="scale"
                    dur={`${PERIOD}s`}
                    begin={`${shot.begin}s`}
                    repeatCount="indefinite"
                    values="1;1;1.32;1.32"
                    keyTimes={`0;${travel};${travel + 0.22};1`}
                  />
                </rect>
              )}
            </g>
          )
        })}

      {/* Agent 芯片 */}
      {AGENTS.map((agent) => (
        <g key={agent.name} transform={`translate(12 ${agent.y - 14})`}>
          <rect width={AGENT_X - 12} height={28} rx={8} fill="var(--surface)" stroke="var(--edge)" />
          <rect x={5} y={5} width={18} height={18} rx={5} fill="var(--well-2)" />
          <text x={14} y={17.5} textAnchor="middle" className="fill-ink-2 font-mono text-[8.5px] font-semibold">
            {agent.name.slice(0, 2).toUpperCase()}
          </text>
          <text x={30} y={18} className="fill-ink text-[11px] font-medium">
            {agent.name}
          </text>
        </g>
      ))}

      {/* 网关：盖在路线之上，光点穿过时被它遮住 */}
      <g>
        <rect
          x={GW.x - GW.r}
          y={GW.y - GW.r}
          width={GW.r * 2}
          height={GW.r * 2}
          rx={18}
          fill="var(--surface)"
          stroke="var(--edge-2)"
          style={{ filter: 'drop-shadow(0 6px 14px rgb(0 0 0 / .12))' }}
        />
        <g transform={`translate(${GW.x - 14} ${GW.y - 14}) scale(0.875)`} stroke="var(--ink)" fill="none" strokeLinecap="round">
          <path d="M7.8 9.2 13.6 16 7.8 22.8" strokeWidth={3.2} strokeLinejoin="round" />
          <path d="M19.2 10.6h5.2M19.2 16h5.2M19.2 21.4h5.2" strokeWidth={2.7} />
        </g>
        <text x={GW.x} y={GW.y + GW.r + 16} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
          OneSSH
        </text>
      </g>

      {/* 主机 */}
      {HOSTS.map((host) => (
        <g key={host.name}>
          <circle cx={HOST_X} cy={host.y} r={3} fill="var(--ok)" />
          <text x={HOST_X + 9} y={host.y + 4} className="fill-ink font-mono text-[10.5px]">
            {host.name}
          </text>
        </g>
      ))}
    </svg>
  )
}

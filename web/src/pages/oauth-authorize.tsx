import { ArrowSquareOut, Check, Desktop, HardDrives, Moon, ShieldCheck, Sun, WarningCircle } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api, post, type ApiError } from '@/api/client'
import type { OAuthAuthorizationInfo, OAuthDecisionPayload, OAuthDecisionResult } from '@/api/types'
import { LogoGlyph, LogoTile } from '@/components/brand/logo'
import { CapabilityPreview, HostScopePicker, ManageHostsCard, ToolGroupSwitches, scopeError, type Scope } from '@/components/tokens/scope'
import { Initials, Pill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, Well } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Num } from '@/components/ui/number'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { useTheme, type ThemeMode } from '@/lib/theme'

/**
 * 授权页沿用旧版默认：先给全部主机的执行范围，管理权限必须显式打开。
 * 用户在这里通常是「把自己的主力 Agent 接进来」，默认收窄会让每次授权多一步；
 * 收窄入口就在眼前，能力预览会把后果写清楚。
 */
const DEFAULT_SCOPE: Scope = { all_hosts: true, host_ids: [], disabled_tools: [], manage_hosts: false }

/** 后端目前只签发 mcp 一种范围；未知范围原样展示，不编造语义 */
const SCOPE_HINTS: Record<string, string> = {
  mcp: '使用 OneSSH MCP 工具',
}

const themeOptions: { value: ThemeMode; label: React.ReactNode; title: string }[] = [
  { value: 'light', label: <Sun />, title: '浅色' },
  { value: 'dark', label: <Moon />, title: '深色' },
  { value: 'system', label: <Desktop />, title: '跟随系统' },
]

type CallbackTrust = {
  /** 展示用地址：http(s) 只留 host + path，自定义协议保持原样 */
  display: string
  badge: string
  tone: 'ok' | 'warn' | 'neutral'
  detail: string
}

/**
 * 回调地址是这个页面唯一能验证「授权码会去哪」的线索，所以按可信度分级说明，
 * 而不是笼统地把 redirect_uri 丢给用户自己判断。
 */
function describeCallback(raw: string): CallbackTrust {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { display: raw, badge: '无法解析', tone: 'warn', detail: '这不是一个合法的回调 URL，除非你确认客户端来源，否则不要授权。' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      display: raw,
      badge: '本机应用',
      tone: 'ok',
      detail: `授权码交给本机注册了 ${url.protocol.replace(':', '')}: 协议的应用，不经过网络。`,
    }
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const isLoopback = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || /^127\./.test(hostname)
  const display = url.host + (url.pathname === '/' ? '' : url.pathname)
  if (isLoopback) {
    return { display, badge: '本机回调', tone: 'ok', detail: '回调指向你这台机器上的本地端口，授权码不会离开本机。' }
  }
  if (url.protocol === 'http:') {
    return { display, badge: '明文外部地址', tone: 'warn', detail: '回调走未加密的 HTTP 发往外部主机，授权码可能在链路中被读取。' }
  }
  return { display, badge: '外部地址', tone: 'neutral', detail: '授权码会被发往这个外部地址，确认你信任它再继续。' }
}

/** 授权链路：客户端 → OneSSH → N 台主机。虚线上有一颗光点在走，提醒这是一条即将打通的通道 */
function Chain({ client, hostLabel }: { client: string; hostLabel: React.ReactNode }) {
  const link = (
    <span
      aria-hidden
      className={cn(
        'relative mx-1.5 mb-[22px] h-px flex-1 overflow-hidden bg-[repeating-linear-gradient(90deg,var(--ink-4)_0_4px,transparent_4px_7px)]',
        'after:absolute after:-top-px after:-left-[20%] after:h-[3px] after:w-[20%] after:animate-travel after:rounded-[3px] after:bg-ink',
      )}
    />
  )
  const node = (icon: React.ReactNode, label: React.ReactNode, me?: boolean) => (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <span
        className={cn(
          'grid size-9 place-items-center rounded-[11px] [&_svg]:size-4',
          me ? 'bg-primary text-primary-fg' : 'bg-surface text-ink-2 shadow-card',
        )}
      >
        {icon}
      </span>
      <span className="max-w-[120px] truncate font-mono text-[11px] text-ink-2">{label}</span>
    </div>
  )
  return (
    <div className="flex items-center">
      {node(<Initials name={client} className="size-full rounded-[11px] bg-transparent text-[11px] shadow-none" />, client)}
      {link}
      {node(<LogoGlyph />, 'OneSSH', true)}
      {link}
      {node(<HardDrives />, hostLabel)}
    </div>
  )
}

/** 骨架与真实内容同高同分区，避免加载完成时整卡跳动 */
function ConsentSkeleton() {
  return (
    <Card aria-busy className="p-1.5">
      <div className="px-5 pt-5 pb-5">
        <Skeleton className="h-3 w-28" />
        <div className="mt-3.5 flex items-center gap-3">
          <Skeleton className="size-10 rounded-[11px]" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="mt-5 h-14 w-full" />
      </div>
      {[64, 40, 180, 220].map((h) => (
        <div key={h} className="border-t border-line px-5 py-[18px]">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 w-full" style={{ height: h }} />
        </div>
      ))}
      <Skeleton className="h-[60px] w-full rounded-well" />
    </Card>
  )
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-[18px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12.5px] font-semibold">{title}</h2>
        {aside && <span className="text-[12px] text-ink-3">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  const { mode, setMode } = useTheme()
  return (
    <div className="relative min-h-dvh bg-bg px-4 py-10 sm:py-14">
      {/* 与概览流量带同一套点阵纹理，只铺在顶部并向下淡出 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_1px_1px,var(--line)_1px,transparent_0)] bg-[length:16px_16px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative mx-auto w-full max-w-[600px]">
        <header className="mb-5 flex items-center gap-2.5">
          <LogoTile className="size-[26px]" />
          <b className="text-[14.5px] tracking-[-0.015em]">OneSSH</b>
          <span className="text-[13px] text-ink-3">授权请求</span>
          <Segmented value={mode} onChange={setMode} options={themeOptions} size="sm" aria-label="主题" className="ml-auto" />
        </header>
        {children}
      </div>
    </div>
  )
}

export function OAuthAuthorizePage() {
  const { search } = useLocation()
  // 两个按钮共用一次提交，用 pending 记住是谁在提交：另一个按钮同时禁用，spinner 也只转在被点的那个上
  const [pending, setPending] = useState<'approve' | 'deny' | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE)
  const [scopeProblem, setScopeProblem] = useState('')
  const [shake, setShake] = useState(0)

  const authorization = useQuery({
    queryKey: ['oauth-authorization', search],
    queryFn: () => api<OAuthAuthorizationInfo>(`/oauth/authorization${search}`),
    // 授权请求是一次性的：重试只会让用户对着 spinner 多等一轮，失败原因也不会变
    retry: false,
    staleTime: Infinity,
    enabled: search.length > 0,
  })

  const info = authorization.data
  const hosts = info?.hosts ?? []
  const patch = (next: Partial<Scope>) => {
    setScope((prev) => ({ ...prev, ...next }))
    setScopeProblem('')
  }

  const submit = async (decision: 'approve' | 'deny') => {
    if (decision === 'approve') {
      const problem = scopeError(scope)
      if (problem) {
        setScopeProblem(problem)
        setShake((n) => n + 1)
        return
      }
    }
    setPending(decision)
    setSubmitError('')
    const payload: OAuthDecisionPayload = {
      query: search,
      decision,
      all_hosts: scope.all_hosts,
      manage_hosts: scope.manage_hosts,
      host_ids: scope.all_hosts ? undefined : scope.host_ids,
      disabled_tools: scope.disabled_tools,
    }
    try {
      const result = await post<OAuthDecisionResult>('/oauth/authorization', payload)
      // 成功后不复位 pending：页面正在离开，按钮保持禁用比闪回可点状态更诚实
      window.location.assign(result.redirect_uri)
    } catch (e) {
      setSubmitError((e as ApiError).message)
      setPending(null)
    }
  }

  if (!search) {
    return (
      <Frame>
        <Card>
          <EmptyState
            icon={<WarningCircle className="text-bad" />}
            title="授权链接不完整"
            description="地址里缺少 OAuth 参数。请回到 Agent 客户端重新发起连接，它会带着完整参数把你送回这里。"
          />
        </Card>
      </Frame>
    )
  }

  if (authorization.isPending) {
    return (
      <Frame>
        <ConsentSkeleton />
      </Frame>
    )
  }

  if (authorization.isError || !info) {
    return (
      <Frame>
        <Card>
          <EmptyState
            icon={<WarningCircle className="text-bad" />}
            title="无法读取授权请求"
            description={(authorization.error as Error | null)?.message ?? '授权请求为空'}
            action={<Button onClick={() => void authorization.refetch()}>重试</Button>}
          />
        </Card>
      </Frame>
    )
  }

  const callback = describeCallback(info.redirect_uri)
  const locked = pending !== null
  const hostCount = scope.all_hosts ? hosts.length : scope.host_ids.length

  return (
    <Frame>
      <motion.div initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: spring.enter }}>
        <Card className="p-1.5">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit('approve')
            }}
          >
            <div className="px-5 pt-5 pb-5">
              <p className="font-mono text-[11.5px] font-medium text-ink-3">MCP 客户端请求接入</p>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                <Initials name={info.client_name} className="size-10 rounded-[11px] text-[12px]" />
                <div className="min-w-0">
                  <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.02em] break-words">{info.client_name}</h1>
                  {/* client_uri 由客户端自报，只放行 http(s)，其余一律降级成纯文本 */}
                  {info.client_uri &&
                    (/^https?:\/\//i.test(info.client_uri) ? (
                      <a
                        href={info.client_uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[12.5px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                      >
                        <span className="truncate">{info.client_uri}</span>
                        <ArrowSquareOut size={12} className="shrink-0" />
                      </a>
                    ) : (
                      <p className="mt-0.5 truncate font-mono text-[12px] text-ink-3" title={info.client_uri}>
                        {info.client_uri}
                      </p>
                    ))}
                </div>
              </div>
              <Well className="mt-5 px-4 pt-4 pb-3">
                <Chain
                  client={info.client_name}
                  hostLabel={
                    scope.all_hosts ? (
                      '全部主机'
                    ) : (
                      <>
                        <Num value={hostCount} /> 台主机
                      </>
                    )
                  }
                />
              </Well>
              <p className="mt-3.5 text-[13px] leading-relaxed text-ink-2">
                它将以你的身份调用 OneSSH。能碰哪些主机、能用哪些工具，完全由下面这几项决定；之后可以随时在「令牌」页收窄或撤销。
              </p>
            </div>

            <Section title="回调地址">
              <div className="flex flex-col gap-1.5 sm:flex-row-reverse sm:items-start sm:justify-between sm:gap-3">
                <Pill tone={callback.tone} className="self-start">
                  {callback.tone === 'ok' ? (
                    <ShieldCheck size={12} weight="fill" />
                  ) : callback.tone === 'warn' ? (
                    <WarningCircle size={12} weight="fill" />
                  ) : null}
                  {callback.badge}
                </Pill>
                <code className="min-w-0 font-mono text-[12px] break-all" title={info.redirect_uri}>
                  {callback.display}
                </code>
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-ink-2">{callback.detail}</p>
            </Section>

            <Section title="请求的范围">
              {info.requested_scopes.length === 0 ? (
                <p className="text-[12.5px] text-ink-2">客户端没有声明额外范围，权限完全由下面的主机与工具设置决定。</p>
              ) : (
                <ul className="space-y-2">
                  {info.requested_scopes.map((s) => (
                    <li key={s} className="flex gap-2.5">
                      <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-ink-2" />
                      {/* 认识的范围给中文语义、原文降为脚注；不认识的只原样照抄，不替后端编语义 */}
                      {SCOPE_HINTS[s] ? (
                        <div className="min-w-0">
                          <p className="text-[13px]">{SCOPE_HINTS[s]}</p>
                          <code className="font-mono text-[11px] break-all text-ink-3">{s}</code>
                        </div>
                      ) : (
                        <code className="min-w-0 font-mono text-[12px] break-all">{s}</code>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="主机范围">
              <HostScopePicker
                hosts={hosts}
                all={scope.all_hosts}
                onAllChange={(all) => patch({ all_hosts: all })}
                value={scope.host_ids}
                onChange={(ids) => patch({ host_ids: ids })}
                invalid={Boolean(scopeProblem)}
                shake={shake}
                disabled={locked}
              />
            </Section>

            <Section title="工具组" aside="关掉的组对该客户端隐藏，调用会被拒绝">
              <ToolGroupSwitches groups={info.tool_groups ?? []} disabled={scope.disabled_tools} onChange={(d) => patch({ disabled_tools: d })} locked={locked} />
            </Section>

            <Section title="管理权限">
              <ManageHostsCard checked={scope.manage_hosts} onChange={(v) => patch({ manage_hosts: v })} disabled={locked} />
              <CapabilityPreview name={info.client_name} scope={scope} groups={info.tool_groups ?? []} hostCount={hosts.length} className="mt-3.5" />
            </Section>

            <div className="rounded-well bg-well p-2.5 shadow-well">
              {/* 提交失败是服务端结果而不是字段校验，贴在按钮上方比 toast 更容易被看到 */}
              {(submitError || scopeProblem) && (
                <p className="mb-2.5 flex items-start gap-2 rounded-[8px] bg-bad-soft px-3 py-2 text-[12px] leading-5 text-bad">
                  <WarningCircle size={15} weight="fill" className="mt-px shrink-0" />
                  {submitError || scopeProblem}
                </p>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <span className="mr-auto hidden pl-1.5 text-[12px] text-ink-3 sm:inline">授权后客户端会拿到一枚 Agent 令牌</span>
                <Button size="lg" className="w-full sm:w-auto" loading={pending === 'deny'} disabled={locked} onClick={() => void submit('deny')}>
                  拒绝
                </Button>
                <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto" loading={pending === 'approve'} disabled={locked}>
                  允许访问
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </motion.div>
      <p className="mt-4 px-1 text-[12px] leading-5 text-ink-3">
        这枚令牌会出现在控制台「令牌」页的 OAuth 客户端分组里，你可以随时收窄它的范围或直接撤销。
      </p>
    </Frame>
  )
}

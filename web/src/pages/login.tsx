import { ArrowRight, Fingerprint, LockKey, Prohibit, ShieldCheck, WarningCircle } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useAnimate } from 'motion/react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { post, type ApiError } from '@/api/client'
import { FlowIllustration } from '@/components/brand/flow-illustration'
import { LogoTile } from '@/components/brand/logo'
import { Dot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, Well } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { spring } from '@/lib/motion'

const PROMISES = [
  { icon: <LockKey />, title: '凭据不出网关', desc: '私钥与密码加密存放，只在建连那一刻解密。' },
  { icon: <ShieldCheck />, title: '权限可收敛', desc: '每枚令牌一组主机、一组工具，随时撤销。' },
  { icon: <Fingerprint />, title: '全程留痕', desc: '每次调用、每次拒绝都写进审计。' },
]

/** 网关版本与健康状态：/healthz 不需要登录，登录页据此告诉人「网关在、是哪个版本」 */
function useGatewayHealth() {
  const [health, setHealth] = useState<{ ok: boolean; version?: string } | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/healthz')
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((body: { ok?: boolean; version?: string }) => alive && setHealth({ ok: body.ok === true, version: body.version }))
      .catch(() => alive && setHealth({ ok: false }))
    return () => {
      alive = false
    }
  }, [])
  return health
}

/**
 * 登录：一张卡片两栏。左边是下沉的井（卡片 16 − 内边距 6 = 井 10，同心），
 * 放概览流量带的示意缩影与三条承诺，登录前就讲清 OneSSH 在做什么；右边只有一个密码框。
 * 背景是流量带同款点阵，向四周淡出。失败时卡片轻摇一下，错误行内红字——不用 toast。
 */
export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [card, animateCard] = useAnimate()
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<{ password: string }>()

  const shake = () => {
    if (card.current) void animateCard(card.current, { x: [0, -7, 6, -4, 3, 0] }, { duration: 0.36 })
  }

  const submit = handleSubmit(
    async ({ password }) => {
      setError('')
      try {
        await post('/login', { password })
        // 换会话必须丢弃旧缓存，否则上一个身份的数据会闪现
        queryClient.clear()
        // from 已带查询串（OAuth 授权链接全靠它）；只认站内相对路径，"//host" 会被浏览器当协议相对 URL 跳走
        const from = (location.state as { from?: string } | null)?.from
        const back = from && from.startsWith('/') && !from.startsWith('//') ? from : '/'
        navigate(back, { replace: true })
      } catch (e) {
        // 后端 401 只会回 "Unauthorized"，直接透出对中文界面既突兀也没信息量
        const err = e as ApiError
        setError(err.status === 401 ? '密码不正确，请重新输入' : err.message)
        shake()
        setFocus('password')
      }
    },
    () => shake(),
  )

  const health = useGatewayHealth()
  const message = errors.password?.message || error
  const fromOAuth = ((location.state as { from?: string } | null)?.from ?? '').startsWith('/oauth/authorize')

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--line)_1px,transparent_0)] bg-[length:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <motion.div
        ref={card}
        className="relative w-full max-w-[400px] md:max-w-[880px]"
        initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: spring.enter }}
      >
        <Card className="grid p-1.5 md:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
          <Well className="hidden flex-col px-5 pt-5 pb-4 md:flex">
            <div className="flex items-center gap-2 font-mono text-[11.5px] text-ink-3">
              <Dot tone={health == null ? 'neutral' : health.ok ? 'ok' : 'bad'} live={health?.ok} />
              {health == null ? '正在检查网关…' : health.ok ? `网关运行中${health.version ? ` · ${health.version}` : ''}` : '网关健康检查失败'}
            </div>
            <motion.div
              className="flex flex-1 flex-col justify-center py-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.5 } }}
            >
              <FlowIllustration />
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-3">
                每一次调用都先经过网关
                <span className="inline-flex items-center gap-1 text-bad">
                  <Prohibit size={12} weight="bold" />
                  越权的停在这里
                </span>
              </p>
            </motion.div>
            <ul className="grid gap-2.5 border-t border-line pt-4">
              {PROMISES.map((item) => (
                <li key={item.title} className="flex gap-2.5">
                  <span className="mt-px grid size-6 shrink-0 place-items-center rounded-[7px] bg-surface text-ink-2 shadow-card [&_svg]:size-3.5">
                    {item.icon}
                  </span>
                  <span className="min-w-0 text-[12px] leading-5">
                    <b className="font-medium text-ink">{item.title}</b>
                    <span className="text-ink-2"> · {item.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Well>

          <div className="flex flex-col px-6 pt-7 pb-6 md:px-8 md:pt-9">
            <LogoTile className="size-10" />
            <h1 className="mt-5 text-[22px] leading-tight font-semibold tracking-[-0.02em]">登录 OneSSH</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              {fromOAuth ? '登录后继续处理 Agent 的授权请求。' : '面向 AI Agent 的集中式 SSH 网关控制台。'}
            </p>

            <form onSubmit={submit} className="mt-8" noValidate>
              <Label htmlFor="login-password">管理员密码</Label>
              <Input
                id="login-password"
                type="password"
                size="lg"
                autoFocus
                autoComplete="current-password"
                placeholder="输入管理员密码"
                prefix={<LockKey />}
                invalid={Boolean(message)}
                wrapperClassName="mt-1.5"
                {...register('password', {
                  required: '请输入管理员密码',
                  onChange: () => error && setError(''),
                })}
              />
              <p className="mt-2 flex min-h-5 items-start gap-1.5 text-[12px] leading-5 text-bad" aria-live="polite">
                {message && (
                  <>
                    <WarningCircle size={14} weight="fill" className="mt-[3px] shrink-0" />
                    {message}
                  </>
                )}
              </p>
              <Button type="submit" variant="primary" size="lg" className="mt-3 w-full" loading={isSubmitting}>
                进入控制台
                {!isSubmitting && <ArrowRight />}
              </Button>
            </form>

            <p className="mt-auto pt-8 text-[12px] leading-5 text-ink-3">
              密码由部署时的 <code className="rounded-[5px] bg-well-2 px-1 py-px font-mono text-[11px] text-ink-2">ONESSH_ADMIN_PASSWORD</code>{' '}
              设定；忘记时在部署环境里重设并重启网关。
            </p>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

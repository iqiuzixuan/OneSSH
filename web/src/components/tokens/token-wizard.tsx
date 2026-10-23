import { Check, LockKey, Ticket, X } from '@phosphor-icons/react'
import { AnimatePresence, motion, useAnimate, type Variants } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCreateToken } from '@/api/queries'
import type { Host, Token, ToolGroup } from '@/api/types'
import { Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Kbd } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import {
  CapabilityPreview,
  HostScopePicker,
  ManageHostsCard,
  ToolGroupSwitches,
  scopeError,
  type Scope,
} from './scope'
import { SecretReveal } from './secret-reveal'

const STEPS = ['命名', '主机范围', '工具组', '权限'] as const
const SUGGESTIONS = ['deploy-bot', 'claude-staging', 'nightly-backup']

/** 默认最小授权：不预选任何主机，工具组全开（实例级禁用仍然生效），管理权限关闭 */
const EMPTY_SCOPE: Scope = { all_hosts: false, host_ids: [], disabled_tools: [], manage_hosts: false }

const stage: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: 14 * dir, filter: 'blur(3px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)', transition: spring.soft },
  exit: (dir: number) => ({ opacity: 0, x: -14 * dir, filter: 'blur(3px)', transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }),
}

function StepTitle({ title, hint }: { title: string; hint: React.ReactNode }) {
  return (
    <>
      <h4 className="text-[17px] font-semibold tracking-[-0.015em]">{title}</h4>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{hint}</p>
    </>
  )
}

/**
 * 签发向导：左侧步骤轨（选中块弹簧滑动）+ 实时能力预览，右侧逐步填写；
 * 第四步签发后原地进入一次性明文揭示。Enter 在向导打开期间始终是「下一步」。
 */
export function TokenWizard({
  open,
  onClose,
  hosts,
  groups,
  tokens,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  hosts: Host[]
  groups: ToolGroup[]
  tokens: Token[]
  onCreated: (token: Token) => void
}) {
  const createToken = useCreateToken()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<Scope>(EMPTY_SCOPE)
  const [secret, setSecret] = useState<string | null>(null)
  const [nameError, setNameError] = useState('')
  const [hostShake, setHostShake] = useState(0)
  const [nameBox, animateNameBox] = useAnimate()
  const nameInput = useRef<HTMLInputElement>(null)

  // 每次打开都从头开始；明文只存在于这一次打开的内存里
  useEffect(() => {
    if (!open) return
    setStep(0)
    setDir(1)
    setName('')
    setScope(EMPTY_SCOPE)
    setSecret(null)
    setNameError('')
  }, [open])

  const done = secret != null
  const trimmed = name.trim()
  const patch = (next: Partial<Scope>) => setScope((prev) => ({ ...prev, ...next }))
  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }
  const shakeName = () => {
    if (nameBox.current) void animateNameBox(nameBox.current, { x: [0, -7, 6, -4, 3, 0] }, { duration: 0.36 })
    nameInput.current?.focus()
  }

  const next = useCallback(async () => {
    if (done) {
      onClose()
      return
    }
    if (step === 0) {
      if (!trimmed) {
        setNameError('给它起个名字——审计、活动流和告警里都会显示它')
        shakeName()
        return
      }
      if (tokens.some((t) => t.name === trimmed)) {
        setNameError(`已经有一枚叫「${trimmed}」的令牌了`)
        shakeName()
        return
      }
    }
    if (step < STEPS.length - 1) {
      go(step + 1)
      return
    }
    const error = scopeError(scope)
    if (error) {
      toast.error(error)
      go(1)
      setHostShake((n) => n + 1)
      return
    }
    if (createToken.isPending) return
    try {
      const created = await createToken.mutateAsync({
        name: trimmed,
        all_hosts: scope.all_hosts,
        manage_hosts: scope.manage_hosts,
        host_ids: scope.all_hosts ? undefined : scope.host_ids,
        disabled_tools: scope.disabled_tools,
      })
      setDir(1)
      setSecret(created.token ?? '')
      onCreated(created)
    } catch {
      // 失败原因已由 mutation 的统一 onError 弹出；停在当前步，用户改完可直接重试
    }
  }, [done, step, trimmed, tokens, scope, createToken, onClose, onCreated])

  // 点过主机格子、开关之后焦点离开了输入框，Enter 仍要能推进
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing) return
      const target = event.target as HTMLElement
      if (target.closest('button, [role="button"], [role="radio"], textarea, a')) return
      event.preventDefault()
      void next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, next])

  const unsure = !scope.all_hosts && scope.host_ids.length === 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="签发令牌" size="xl" bare>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden flex-col rounded-dlg-in bg-well px-3.5 pt-[18px] pb-3.5 shadow-well md:flex">
          <h3 className="px-1 text-[15px] font-semibold tracking-[-0.01em]">签发令牌</h3>
          <p className="px-1 pt-0.5 text-[12px] text-ink-3">四步，约 30 秒</p>
          <div className="mt-[18px] flex flex-col gap-0.5">
            {STEPS.map((label, i) => {
              const current = i === step && !done
              const finished = i < step || done
              return (
                <button
                  key={label}
                  type="button"
                  disabled={done || i >= step}
                  onClick={() => go(i)}
                  className={cn(
                    'relative flex h-[34px] items-center gap-2.5 rounded-[9px] px-2 text-left text-[13px] transition-colors duration-200',
                    current ? 'font-medium text-ink' : finished ? 'text-ink-2' : 'text-ink-3',
                    !done && i < step && 'hover:text-ink',
                  )}
                >
                  {current && (
                    <motion.span layoutId="wizard-step" className="absolute inset-0 rounded-[9px] bg-surface shadow-seg" transition={spring.snap} />
                  )}
                  <span
                    className={cn(
                      'relative z-[1] grid size-5 place-items-center rounded-full font-mono text-[10.5px] font-semibold transition-[background-color,color,box-shadow] duration-200',
                      finished
                        ? 'bg-primary text-primary-fg'
                        : current
                          ? 'text-ink shadow-[inset_0_0_0_1.25px_var(--ink)]'
                          : 'text-ink-3 shadow-[inset_0_0_0_1.25px_var(--ink-4)]',
                    )}
                  >
                    {finished ? <Check size={11} weight="bold" /> : i + 1}
                  </span>
                  <span className="relative z-[1]">{label}</span>
                </button>
              )
            })}
          </div>
          <CapabilityPreview name={trimmed} scope={scope} groups={groups} hostCount={hosts.length} className="mt-auto" />
        </aside>

        <div className="relative flex min-h-[520px] min-w-0 flex-col">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="absolute top-3 right-3 z-[2] grid size-7 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink"
          >
            <X size={15} />
          </button>
          <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-[22px] pt-[22px] pb-2">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div key={done ? 'done' : step} custom={dir} variants={stage} initial="enter" animate="center" exit="exit">
                {done ? (
                  <>
                    <StepTitle title="令牌已签发" hint="把它放进 Agent 的安全配置。关闭这个窗口后，网关只保存它的哈希。" />
                    <div className="mt-[18px]">
                      <SecretReveal secret={secret} autoFocus />
                    </div>
                  </>
                ) : step === 0 ? (
                  <>
                    <StepTitle title="给令牌起个名字" hint="用 Agent 或用途命名。审计记录、活动流和告警里都会显示它。" />
                    <div ref={nameBox} className="mt-[18px]">
                      <Input
                        ref={nameInput}
                        autoFocus
                        size="lg"
                        value={name}
                        maxLength={64}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="例如 deploy-bot"
                        prefix={<Ticket />}
                        invalid={Boolean(nameError)}
                        onChange={(event) => {
                          setName(event.target.value)
                          setNameError('')
                        }}
                        aria-label="令牌名称"
                      />
                    </div>
                    {nameError ? (
                      <p className="mt-2 text-[12px] text-bad">{nameError}</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-[12px] text-ink-3">建议</span>
                        {SUGGESTIONS.map((s) => (
                          <Chip
                            key={s}
                            mono
                            onClick={() => {
                              setName(s)
                              nameInput.current?.focus()
                            }}
                          >
                            {s}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </>
                ) : step === 1 ? (
                  <>
                    <StepTitle title="它能连哪些主机？" hint="范围越小越好。选「全部主机」意味着以后新加的主机也自动包含在内。" />
                    <div className="mt-4">
                      <HostScopePicker
                        hosts={hosts}
                        all={scope.all_hosts}
                        onAllChange={(all) => patch({ all_hosts: all })}
                        value={scope.host_ids}
                        onChange={(ids) => patch({ host_ids: ids })}
                        shake={hostShake}
                      />
                    </div>
                    {unsure && (
                      <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
                        还没选主机。除非最后一步只授予「管理主机」权限，否则这枚令牌什么也做不了。
                      </p>
                    )}
                  </>
                ) : step === 2 ? (
                  <>
                    <StepTitle title="开放哪些工具？" hint="关掉的工具组会从 Agent 的工具列表里消失，强行调用会被网关拒绝并记入审计。" />
                    <div className="mt-3.5">
                      <ToolGroupSwitches groups={groups} disabled={scope.disabled_tools} onChange={(d) => patch({ disabled_tools: d })} />
                    </div>
                  </>
                ) : (
                  <>
                    <StepTitle
                      title="要给它管理主机的权限吗？"
                      hint="与执行权限彼此独立，默认关闭。它不会扩大可访问主机的范围，但能改变「有哪些主机」。"
                    />
                    <div className="mt-4">
                      <ManageHostsCard checked={scope.manage_hosts} onChange={(v) => patch({ manage_hosts: v })} />
                    </div>
                    <p className="mt-4 text-[12px] text-ink-3">签发后令牌明文只显示一次。</p>
                    {/* 窄屏没有左侧步骤轨，最后一步把能力预览补在这里，签发前能完整核对一遍 */}
                    <CapabilityPreview name={trimmed} scope={scope} groups={groups} hostCount={hosts.length} className="mt-3 md:hidden" />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2 py-3 pr-3.5 pl-[22px]">
            <span className="flex-1 text-[12px] text-ink-3">
              {done ? (
                ''
              ) : (
                <>
                  {step + 1} / {STEPS.length} · <Kbd>↵</Kbd> 继续
                </>
              )}
            </span>
            {!done && step > 0 && (
              <Button variant="ghost" onClick={() => go(step - 1)}>
                上一步
              </Button>
            )}
            <Button variant="primary" loading={createToken.isPending} onClick={() => void next()}>
              {done ? (
                '完成'
              ) : step === STEPS.length - 1 ? (
                <>
                  <LockKey />
                  签发令牌
                </>
              ) : (
                '下一步'
              )}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

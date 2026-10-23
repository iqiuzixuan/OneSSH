import { PencilSimple } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useUpdateToken } from '@/api/queries'
import type { Host, Token, ToolGroup } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { CapabilityPreview, HostScopePicker, ManageHostsCard, ToolGroupSwitches, scopeError, scopeOfToken, type Scope } from './scope'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h4 className="mb-2.5 text-[12.5px] font-semibold">{title}</h4>
      {children}
    </section>
  )
}

/**
 * 编辑令牌：与签发向导同一套范围组件，一屏摊开。
 * 修改立即生效——Agent 的下一次调用就按新范围检查，不需要重新签发。
 */
export function TokenEditDialog({
  token,
  onClose,
  hosts,
  groups,
  tokens,
}: {
  token: Token | null
  onClose: () => void
  hosts: Host[]
  groups: ToolGroup[]
  tokens: Token[]
}) {
  const update = useUpdateToken()
  const [name, setName] = useState('')
  const [scope, setScope] = useState<Scope>({ all_hosts: true, host_ids: [], disabled_tools: [], manage_hosts: false })
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)

  useEffect(() => {
    if (!token) return
    setName(token.name)
    setScope(scopeOfToken(token))
    setError('')
  }, [token])

  const patch = (next: Partial<Scope>) => {
    setScope((prev) => ({ ...prev, ...next }))
    setError('')
  }
  const trimmed = name.trim()
  const nameError = !trimmed
    ? '名称不能为空'
    : tokens.some((t) => t.id !== token?.id && t.name === trimmed)
      ? `已经有一枚叫「${trimmed}」的令牌了`
      : ''

  const save = async () => {
    if (!token || nameError) return
    const problem = scopeError(scope)
    if (problem) {
      setError(problem)
      setShake((n) => n + 1)
      return
    }
    try {
      await update.mutateAsync({
        id: token.id,
        payload: {
          name: trimmed,
          all_hosts: scope.all_hosts,
          manage_hosts: scope.manage_hosts,
          host_ids: scope.all_hosts ? undefined : scope.host_ids,
          disabled_tools: scope.disabled_tools,
        },
      })
      onClose()
    } catch {
      // 失败提示由 mutation 统一弹出，弹窗保持打开以便修改重试
    }
  }

  return (
    <Dialog
      open={token != null}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      icon={<PencilSimple />}
      title={token ? `编辑「${token.name}」` : '编辑令牌'}
      description="修改立即生效：使用这枚令牌的 Agent，下一次调用就按新范围检查。"
      footer={
        <>
          {error && <span className="mr-auto pl-1.5 text-[12px] text-bad">{error}</span>}
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={update.isPending} disabled={Boolean(nameError)} onClick={() => void save()}>
            保存
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Field label="名称" error={nameError && name ? nameError : undefined}>
          {(id) => (
            <Input
              id={id}
              value={name}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              invalid={Boolean(nameError)}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Section title="主机范围">
          <HostScopePicker
            hosts={hosts}
            all={scope.all_hosts}
            onAllChange={(all) => patch({ all_hosts: all })}
            value={scope.host_ids}
            onChange={(ids) => patch({ host_ids: ids })}
            invalid={Boolean(error)}
            shake={shake}
          />
        </Section>
        <Section title="工具组">
          <ToolGroupSwitches groups={groups} disabled={scope.disabled_tools} onChange={(d) => patch({ disabled_tools: d })} />
        </Section>
        <Section title="管理权限">
          <ManageHostsCard checked={scope.manage_hosts} onChange={(v) => patch({ manage_hosts: v })} />
        </Section>
        <CapabilityPreview name={trimmed} scope={scope} groups={groups} hostCount={hosts.length} className="mt-5" />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

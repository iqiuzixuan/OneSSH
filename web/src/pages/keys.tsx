import { DownloadSimple, Key, Plus } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useCreateKey, useDeleteKey, useDeleteKeys, useHosts, useKeys } from '@/api/queries'
import type { KeyPayload, SSHKey } from '@/api/types'
import { KeyCard } from '@/components/keys/key-card'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Segmented } from '@/components/ui/segmented'
import { SelectionBar } from '@/components/ui/selection-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { staggerItem } from '@/lib/motion'

type KeyFormValues = { name: string; private_key: string }

/** 生成 / 导入共用一个对话框：模式切换时私钥框随高度展开，对话框跟着长，不会突然跳一截 */
function KeyDialog({
  open,
  mode,
  onModeChange,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  mode: KeyPayload['mode']
  onModeChange: (mode: KeyPayload['mode']) => void
  onOpenChange: (open: boolean) => void
  onCreated: (key: SSHKey) => void
}) {
  const createKey = useCreateKey()
  const reduceMotion = useReducedMotion()
  const {
    handleSubmit,
    register,
    reset,
    formState: { errors },
  } = useForm<KeyFormValues>({ defaultValues: { name: '', private_key: '' } })

  useEffect(() => {
    if (open) reset({ name: '', private_key: '' })
  }, [open, reset])

  const submit = handleSubmit(async (values) => {
    const key = await createKey.mutateAsync({
      name: values.name.trim(),
      mode,
      private_key: mode === 'import' ? values.private_key : undefined,
    })
    onOpenChange(false)
    onCreated(key)
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<Key />}
      title={mode === 'generate' ? '生成密钥' : '导入私钥'}
      description={
        mode === 'generate'
          ? '网关生成一把 ed25519 密钥，私钥加密入库、永不返回；把公钥加入目标主机的 authorized_keys 即可使用。'
          : '粘贴已有的 OpenSSH 私钥。导入后只保留加密副本，任何接口都不会再返回明文。'
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" type="submit" form="key-form" loading={createKey.isPending}>
            {mode === 'generate' ? '生成' : '导入'}
          </Button>
        </>
      }
    >
      <form id="key-form" onSubmit={submit} className="space-y-4">
        <Segmented
          value={mode}
          onChange={onModeChange}
          aria-label="创建方式"
          className="flex w-full [&>button]:flex-1"
          options={[
            { value: 'generate', label: '生成 ed25519' },
            { value: 'import', label: '导入 OpenSSH 私钥' },
          ]}
        />
        <Field label="名称" required error={errors.name?.message}>
          {(id) => (
            <Input
              id={id}
              autoFocus
              placeholder="例如 deploy-ed25519"
              invalid={Boolean(errors.name)}
              className="font-mono text-[12.5px]"
              {...register('name', { validate: (v) => v.trim() !== '' || '请输入名称' })}
            />
          )}
        </Field>
        <AnimatePresence initial={false}>
          {mode === 'import' && (
            <motion.div
              key="private-key"
              className="overflow-hidden"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
            >
              {/* 负外边距补回 overflow-hidden 裁掉的焦点环空间 */}
              <div className="-m-1 p-1">
                <Field label="私钥" required error={errors.private_key?.message}>
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={8}
                      spellCheck={false}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      invalid={Boolean(errors.private_key)}
                      {...register('private_key', { required: mode === 'import' ? '请粘贴私钥' : false })}
                    />
                  )}
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </Dialog>
  )
}

export function KeysPage() {
  const keys = useKeys()
  const hosts = useHosts()
  const deleteKey = useDeleteKey()
  const deleteKeys = useDeleteKeys()
  const [dialog, setDialog] = useState<{ open: boolean; mode: KeyPayload['mode'] }>({ open: false, mode: 'generate' })
  const [deleting, setDeleting] = useState<SSHKey | null>(null)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // 首屏已有的卡片不播入场；新生成 / 导入的那张从 0.96 弹进来
  const initialIds = useRef<Set<number> | null>(null)
  if (initialIds.current == null && keys.data) initialIds.current = new Set(keys.data.map((key) => key.id))

  // 引用数决定删除的破坏力，直接摆在卡片与确认弹层里，比事后翻主机页可靠
  const usage = useMemo(() => {
    const map = new Map<number, NonNullable<typeof hosts.data>>()
    for (const host of hosts.data ?? []) {
      if (host.auth_type !== 'key' || host.key_id == null) continue
      map.set(host.key_id, [...(map.get(host.key_id) ?? []), host])
    }
    return map
  }, [hosts.data])

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const deletingUsage = deleting ? (usage.get(deleting.id)?.length ?? 0) : 0
  const batchUsage = [...selected].reduce((sum, id) => sum + (usage.get(id)?.length ?? 0), 0)

  return (
    <PageTransition>
      <PageHeader
        title="密钥"
        description="私钥由主密钥经 AES-256-GCM 加密存储，任何接口都不会返回私钥明文——这里只能看到公钥与指纹。"
        actions={
          <>
            <Button onClick={() => setDialog({ open: true, mode: 'import' })}>
              <DownloadSimple />
              导入私钥
            </Button>
            <Button variant="primary" onClick={() => setDialog({ open: true, mode: 'generate' })}>
              <Plus />
              生成 ed25519
            </Button>
          </>
        }
      />

      {keys.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-[188px] rounded-card" />
          ))}
        </div>
      ) : keys.data?.length ? (
        <motion.div variants={staggerItem} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {keys.data.map((key) => (
              <KeyCard
                key={key.id}
                sshKey={key}
                usedBy={usage.get(key.id) ?? []}
                selected={selected.has(key.id)}
                selectionMode={selected.size > 0}
                fresh={!initialIds.current?.has(key.id)}
                onToggle={() => toggle(key.id)}
                onDelete={() => setDeleting(key)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <motion.div variants={staggerItem}>
          <Card>
            <EmptyState
              icon={<Key />}
              title="还没有密钥"
              description="生成一把 ed25519 密钥，或导入已有的 OpenSSH 私钥；主机可以改用密钥认证，不再保存密码。"
              action={
                <Button variant="primary" onClick={() => setDialog({ open: true, mode: 'generate' })}>
                  <Plus />
                  生成第一把密钥
                </Button>
              }
            />
          </Card>
        </motion.div>
      )}

      <KeyDialog
        open={dialog.open}
        mode={dialog.mode}
        onModeChange={(mode) => setDialog((prev) => ({ ...prev, mode }))}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        onCreated={() => undefined}
      />

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button variant="danger" size="sm" onClick={() => setBatchDeleting(true)}>
          删除
        </Button>
      </SelectionBar>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`删除 ${deleting?.name ?? ''}？`}
        description={
          deletingUsage > 0
            ? `这把密钥正被 ${deletingUsage} 台主机使用，删除后这些主机将无法连接。私钥没有任何备份，此操作不可撤销。`
            : '私钥没有任何备份，删除后无法恢复。'
        }
        confirmText="删除"
        danger
        onConfirm={async () => {
          if (!deleting) return
          await deleteKey.mutateAsync(deleting.id)
          // 删成功才摘掉选中项：失败时保留，批量条上还能看到它并重试
          setSelected((prev) => {
            if (!prev.has(deleting.id)) return prev
            const next = new Set(prev)
            next.delete(deleting.id)
            return next
          })
        }}
      />

      <ConfirmDialog
        open={batchDeleting}
        onOpenChange={setBatchDeleting}
        title={`删除所选的 ${selected.size} 把密钥？`}
        description={
          batchUsage > 0
            ? `其中有密钥正被共 ${batchUsage} 台主机使用，删除后这些主机将无法连接。此操作不可撤销。`
            : '所选密钥删除后无法恢复。'
        }
        confirmText="删除"
        danger
        onConfirm={async () => {
          // 失败的留在选中态，方便对照着重试
          const { failedIds } = await deleteKeys.mutateAsync([...selected])
          setSelected(new Set(failedIds))
        }}
      />
    </PageTransition>
  )
}

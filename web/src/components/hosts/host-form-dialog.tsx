import { HardDrives } from '@phosphor-icons/react'
import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useKeys, useSaveHost } from '@/api/queries'
import type { Host, HostPayload } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Well } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/multi-select'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { dedupeTags, MAX_TAG_LENGTH, MAX_TAGS } from './host-utils'

const emptyForm: HostPayload = {
  name: '',
  username: '',
  addr: '',
  port: 22,
  auth_type: 'password',
  password: undefined,
  key_id: undefined,
  jump_host: undefined,
  monitor_enabled: true,
  tags: [],
}

/**
 * 新建 / 编辑主机。编辑时私密凭据不回显：密码留空即不修改；
 * 跳板在视图里是 id、在载荷里是 name，打开时换算一次。
 */
export function HostFormDialog({
  open,
  onOpenChange,
  editing,
  hosts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 缺省为新建 */
  editing?: Host
  hosts: Host[]
  onSaved?: (host: Host) => void
}) {
  const keys = useKeys()
  const save = useSaveHost(editing?.id)
  const monitorId = useId()
  const {
    register,
    control,
    watch,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<HostPayload>({ defaultValues: emptyForm, shouldUnregister: true })
  const authType = watch('auth_type')

  // 每次打开都按当前目标重置：上一次的输入不会残留到下一台主机
  useEffect(() => {
    if (!open) return
    reset(
      editing
        ? {
            ...editing,
            password: undefined,
            jump_host: hosts.find((item) => item.id === editing.jump_host_id)?.name,
          }
        : emptyForm,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在打开时同步一次，列表刷新不应冲掉正在编辑的表单
  }, [open, editing?.id])

  const allTags = [...new Set(hosts.flatMap((host) => host.tags))].sort()

  const submit = handleSubmit(async (values) => {
    // 空字符串是「直连」选项的值，归一成 undefined 才符合后端「省略即清除」的整体替换语义
    const base = { ...values, jump_host: values.jump_host || undefined }
    const payload: HostPayload =
      values.auth_type === 'key'
        ? { ...base, password: undefined }
        : { ...base, key_id: undefined, password: values.password || undefined }
    const saved = await save.mutateAsync(payload)
    onOpenChange(false)
    onSaved?.(saved)
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<HardDrives />}
      title={editing ? `编辑 ${editing.name}` : '添加主机'}
      description={
        editing
          ? '凭据只写不可读：密码留空即保持原值。'
          : '凭据经主密钥 AES-256-GCM 加密后入库，只在建立 SSH 连接的那一刻解密。'
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" form="host-form" variant="primary" loading={save.isPending}>
            {editing ? '保存' : '添加主机'}
          </Button>
        </>
      }
    >
      {/* 6 列栅格：端口只占 2 列，凭据与认证方式并排——切换认证方式时不会挤动下方的行 */}
      <form id="host-form" className="grid gap-x-3 gap-y-4 sm:grid-cols-6" onSubmit={submit}>
        <Field label="名称" required error={errors.name?.message} hint="网关内唯一，Agent 用它引用这台主机" className="sm:col-span-6">
          {(id) => (
            <Input
              id={id}
              autoFocus
              placeholder="例如 web-prod-01"
              invalid={Boolean(errors.name)}
              className="font-mono text-[12.5px]"
              {...register('name', { required: '请输入名称' })}
            />
          )}
        </Field>
        <Field label="地址" required error={errors.addr?.message} className="sm:col-span-4">
          {(id) => (
            <Input
              id={id}
              placeholder="主机名或 IP 地址"
              invalid={Boolean(errors.addr)}
              className="font-mono text-[12.5px]"
              {...register('addr', { required: '请输入地址' })}
            />
          )}
        </Field>
        <Field label="端口" required error={errors.port?.message} className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={65535}
              // 端口不适合用步进箭头微调，隐藏原生 spinner
              className="font-mono text-[12.5px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              invalid={Boolean(errors.port)}
              {...register('port', {
                required: '请输入端口',
                valueAsNumber: true,
                min: { value: 1, message: '端口不能小于 1' },
                max: { value: 65535, message: '端口不能大于 65535' },
              })}
            />
          )}
        </Field>
        <Field label="用户名" required error={errors.username?.message} className="sm:col-span-3">
          {(id) => (
            <Input
              id={id}
              placeholder="ops"
              invalid={Boolean(errors.username)}
              className="font-mono text-[12.5px]"
              {...register('username', { required: '请输入用户名' })}
            />
          )}
        </Field>
        <Field label="认证方式" required error={errors.auth_type?.message} className="sm:col-span-3">
          {() => (
            <Controller
              name="auth_type"
              control={control}
              rules={{ required: '请选择认证方式' }}
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  aria-label="认证方式"
                  className="flex w-full [&>button]:flex-1"
                  options={[
                    { value: 'password', label: '密码' },
                    { value: 'key', label: 'SSH 密钥' },
                  ]}
                />
              )}
            />
          )}
        </Field>

        {authType === 'key' ? (
          <Field
            label="密钥"
            required
            error={errors.key_id?.message}
            hint={keys.data?.length === 0 ? '还没有密钥，先去「密钥」页生成或导入一把' : undefined}
            className="sm:col-span-6"
          >
            {(id) => (
              <Controller
                name="key_id"
                control={control}
                rules={{ required: '请选择密钥' }}
                render={({ field }) => (
                  <Select
                    id={id}
                    value={field.value}
                    onChange={field.onChange}
                    options={(keys.data ?? []).map((key) => ({ value: key.id, label: key.name }))}
                    placeholder="选择密钥"
                    invalid={Boolean(errors.key_id)}
                  />
                )}
              />
            )}
          </Field>
        ) : (
          <Field
            label={editing ? '新密码' : '密码'}
            required={!editing}
            error={errors.password?.message}
            hint={editing ? '留空则不修改' : undefined}
            className="sm:col-span-6"
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                invalid={Boolean(errors.password)}
                {...register('password', { required: editing ? false : '请输入密码' })}
              />
            )}
          </Field>
        )}

        <Field label="跳板主机" hint="选中后先经该主机建立隧道再连目标；链路最多 5 级" className="sm:col-span-6">
          {(id) => (
            <Controller
              name="jump_host"
              control={control}
              render={({ field }) => (
                <Select
                  id={id}
                  // 选项取主机 id 而非主机名：后端不限主机名字符集，任何字符串哨兵都可能撞名；
                  // id 恒为正整数，0 可以安全表示「直连」。载荷仍按名称提交，两侧在这里换算。
                  value={hosts.find((item) => item.name === field.value)?.id ?? 0}
                  onChange={(value) => field.onChange(hosts.find((item) => item.id === value)?.name)}
                  options={[
                    { value: 0, label: '直连（不使用跳板）' },
                    ...hosts
                      .filter((item) => item.name !== editing?.name)
                      .map((item) => ({ value: item.id, label: item.name, description: `${item.addr}:${item.port}` })),
                  ]}
                />
              )}
            />
          )}
        </Field>

        <Field
          label="标签"
          hint={`按用途或环境分组，输入新标签回车即创建；最多 ${MAX_TAGS} 个、每个 ${MAX_TAG_LENGTH} 字符`}
          className="sm:col-span-6"
        >
          {(id) => (
            <Controller
              name="tags"
              control={control}
              render={({ field }) => {
                // 已选值先归一，勾选 / 回车 / 创建三条路径都从同一份干净数组出发
                const current = dedupeTags(field.value ?? [])
                return (
                  <MultiSelect
                    id={id}
                    value={current}
                    onChange={(next) => field.onChange(dedupeTags(next))}
                    placeholder="选择或创建标签"
                    searchPlaceholder="搜索或输入新标签…"
                    // 候选 = 已有标签 ∪ 当前值：刚创建、还没保存到任何主机的标签也要能回显
                    options={dedupeTags([...current, ...allTags]).map((tag) => ({ value: tag, label: tag }))}
                    maxSelected={MAX_TAGS}
                    onCreateOption={(label) => {
                      const tag = label.trim()
                      if (!tag) return
                      // 限制与后端一致，拦在输入这一刻，而不是等提交才回一句报错
                      if ([...tag].length > MAX_TAG_LENGTH) {
                        toast.error(`标签「${tag}」超过 ${MAX_TAG_LENGTH} 字符`)
                        return
                      }
                      if (current.length >= MAX_TAGS) {
                        toast.error(`标签最多 ${MAX_TAGS} 个`)
                        return
                      }
                      field.onChange(dedupeTags([...current, tag]))
                    }}
                  />
                )
              }}
            />
          )}
        </Field>

        {/* 开关不是会报错的字段：说明与控件同一行的一块井，也给表单收个尾 */}
        <Controller
          name="monitor_enabled"
          control={control}
          render={({ field }) => (
            <Well className="flex items-center justify-between gap-4 px-3 py-2.5 sm:col-span-6">
              <div className="space-y-0.5">
                <Label htmlFor={monitorId}>资源监控</Label>
                <p className="text-[12px] text-ink-3">定期采集 CPU、内存、负载与磁盘，保留 7 天</p>
              </div>
              <Switch id={monitorId} checked={field.value} onCheckedChange={field.onChange} />
            </Well>
          )}
        />
      </form>
    </Dialog>
  )
}

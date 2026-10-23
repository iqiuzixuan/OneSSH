import { Key, Trash } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { Host, SSHKey } from '@/api/types'
import { Tag } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, Well } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { CopyButton } from '@/components/ui/code'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { formatAgo, formatDate } from '@/lib/format'
import { spring } from '@/lib/motion'

/** 公钥行拆成算法、base64 材料、注释三段 */
function splitPublicKey(publicKey: string) {
  const [algorithm = '', material = '', ...comment] = publicKey.trim().split(/\s+/)
  return { algorithm, material, comment: comment.join(' ') }
}

function decodeBase64(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text)
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0)) as Uint8Array<ArrayBuffer>
  } catch {
    return null
  }
}

/** 从 SSH wire 格式里读出 RSA 模数位数：string 算法名、mpint e、mpint n */
function rsaBits(blob: Uint8Array): number | null {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  let offset = 0
  const next = () => {
    if (offset + 4 > blob.length) return null
    const length = view.getUint32(offset)
    const start = offset + 4
    offset = start + length
    return offset <= blob.length ? blob.subarray(start, offset) : null
  }
  next() // 算法名
  next() // e
  const n = next()
  if (!n) return null
  const leadingZero = n[0] === 0 ? 1 : 0
  return (n.length - leadingZero) * 8
}

/** 人能扫一眼的密钥类型：ED25519 / RSA 4096 / ECDSA P-256 */
export function keyType(publicKey: string): string {
  const { algorithm, material } = splitPublicKey(publicKey)
  if (algorithm === 'ssh-ed25519') return 'ED25519'
  if (algorithm === 'ssh-rsa') {
    const blob = decodeBase64(material)
    const bits = blob ? rsaBits(blob) : null
    return bits ? `RSA ${bits}` : 'RSA'
  }
  const ecdsa = /^ecdsa-sha2-nistp(\d+)$/.exec(algorithm)
  if (ecdsa) return `ECDSA P-${ecdsa[1]}`
  return algorithm.replace(/^ssh-/, '').toUpperCase() || 'SSH'
}

/**
 * OpenSSH 风格的 SHA256 指纹（与 `ssh-keygen -lf` 一致）：对公钥 blob 做 SHA-256，
 * base64 去掉末尾的 =。在浏览器里算，后端不必为展示多存一列。
 */
export function useKeyFingerprint(publicKey: string) {
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const blob = decodeBase64(splitPublicKey(publicKey).material)
    if (!blob || !crypto.subtle) return
    void crypto.subtle.digest('SHA-256', blob).then((digest) => {
      if (cancelled) return
      const text = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=+$/, '')
      setFingerprint(`SHA256:${text}`)
    })
    return () => {
      cancelled = true
    }
  }, [publicKey])
  return fingerprint
}

/**
 * 密钥卡：外 16 / 内边距 6 / 公钥井 10（同心）。左上角的钥匙图标在悬停或进入选择模式时
 * 让位给复选框——平时不打扰，要批量操作时触手可及。
 */
export function KeyCard({
  sshKey,
  usedBy,
  selected,
  selectionMode,
  fresh,
  onToggle,
  onDelete,
}: {
  sshKey: SSHKey
  usedBy: Host[]
  selected: boolean
  selectionMode: boolean
  fresh?: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const fingerprint = useKeyFingerprint(sshKey.public_key)
  const { comment } = splitPublicKey(sshKey.public_key)
  const showCheck = selected || selectionMode

  return (
    <motion.div
      layout
      initial={fresh ? { opacity: 0, scale: 0.96, y: 8 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: spring.exit }}
      transition={spring.soft}
    >
      <Card
        className={cn(
          'group/key flex h-full flex-col p-1.5 transition-shadow duration-200',
          selected && 'shadow-[0_0_0_1.5px_var(--ink),var(--sh-card)]',
        )}
      >
        <div className="flex items-center gap-2.5 px-2.5 pt-2.5 pb-3">
          <span className="relative grid size-8 shrink-0 place-items-center">
            <span
              className={cn(
                'grid size-8 place-items-center rounded-[9px] bg-well text-ink-2 shadow-well transition-opacity duration-150',
                showCheck ? 'opacity-0' : 'group-hover/key:opacity-0',
              )}
            >
              <Key size={16} />
            </span>
            <span
              className={cn(
                'absolute inset-0 grid place-items-center transition-opacity duration-150',
                showCheck ? 'opacity-100' : 'opacity-0 group-hover/key:opacity-100 focus-within:opacity-100',
              )}
            >
              <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`选择密钥 ${sshKey.name}`} />
            </span>
          </span>
          <div className="min-w-0">
            <b className="block truncate text-[13.5px] font-semibold">{sshKey.name}</b>
            <div className="truncate text-[11.5px] text-ink-3" title={formatDate(sshKey.created_at)}>
              {formatAgo(sshKey.created_at * 1000)}创建{comment ? ` · ${comment}` : ''}
            </div>
          </div>
          <Tag className="ml-auto">{keyType(sshKey.public_key)}</Tag>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`删除密钥 ${sshKey.name}`}
            title="删除密钥"
            onClick={onDelete}
            className="text-ink-3 opacity-0 transition-opacity group-hover/key:opacity-100 hover:bg-bad-soft hover:text-bad focus-visible:opacity-100"
          >
            <Trash />
          </Button>
        </div>
        <Well className="relative grow py-2.5 pr-10 pl-3">
          {/* select-all：单击即整段选中，长 base64 手动拖选很痛苦 */}
          <p className="line-clamp-3 font-mono text-[11px] leading-[1.6] break-all text-ink-2 select-all">{sshKey.public_key}</p>
          <CopyButton value={sshKey.public_key} label={`复制 ${sshKey.name} 的公钥`} message="公钥已复制" className="absolute top-1.5 right-1.5" />
        </Well>
        <div className="flex items-center justify-between gap-3 px-2.5 pt-2.5 pb-1.5 text-[12px] text-ink-3">
          <span className="truncate font-mono text-[11px]" title={fingerprint ?? undefined}>
            {fingerprint ?? '计算指纹…'}
          </span>
          {usedBy.length ? (
            <Tooltip content={usedBy.map((host) => host.name).join('、')}>
              <span className="shrink-0 text-ink-2 tabular-nums">用于 {usedBy.length} 台主机</span>
            </Tooltip>
          ) : (
            <span className="shrink-0">未使用</span>
          )}
        </div>
      </Card>
    </motion.div>
  )
}

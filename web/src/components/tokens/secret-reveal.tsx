import { Check, Copy, WarningCircle } from '@phosphor-icons/react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/cn'

/**
 * 明文只在创建响应里出现一次，复制失败等于令牌作废，所以逐级降级：
 * clipboard API（非 https 部署时根本不存在）→ execCommand → 选中文本让用户自己按快捷键。
 */
function copyByExecCommand(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.append(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}

function selectNode(el: HTMLElement | null) {
  if (!el) return
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(el)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** 返回 true 表示已进剪贴板；false 时已替用户选中文本并提示手动复制 */
export async function copyWithFallback(text: string, node: HTMLElement | null, okMessage: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    if (!copyByExecCommand(text)) {
      selectNode(node)
      toast.error('无法访问剪贴板，已选中文本，请按 Ctrl/⌘ + C 复制')
      return false
    }
  }
  toast.success(okMessage)
  return true
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** 解密式揭示：字符从左到右逐个落定；降低动效时直接显示 */
function useDecrypt(secret: string) {
  const reduced = useReducedMotion()
  const [text, setText] = useState(reduced ? secret : '')
  useEffect(() => {
    if (reduced) {
      setText(secret)
      return
    }
    let k = 0
    const timer = window.setInterval(() => {
      k += 2
      if (k >= secret.length) {
        window.clearInterval(timer)
        setText(secret)
        return
      }
      setText(secret.slice(0, k) + [...secret.slice(k)].map(() => CHARS[Math.floor(Math.random() * CHARS.length)]).join(''))
    }, 22)
    return () => window.clearInterval(timer)
  }, [secret, reduced])
  return text
}

type SnippetKind = 'claude' | 'json'

function snippetOf(kind: SnippetKind, url: string, secret: string) {
  if (kind === 'claude') {
    return `claude mcp add --transport http onessh ${url} \\\n  --header "Authorization: Bearer ${secret}"`
  }
  return JSON.stringify(
    { mcpServers: { onessh: { type: 'http', url, headers: { Authorization: `Bearer ${secret}` } } } },
    null,
    2,
  )
}

/**
 * 一次性明文揭示：大号等宽明文 + 复制 + 「仅显示一次」警示 + MCP 客户端配置片段。
 * 外层卡片圆角 16、内边距 6，明文井圆角 10（同心）。
 */
export function SecretReveal({ secret, autoFocus }: { secret: string; autoFocus?: boolean }) {
  const text = useDecrypt(secret)
  const secretRef = useRef<HTMLSpanElement>(null)
  const snippetRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const [kind, setKind] = useState<SnippetKind>('claude')
  const url = `${window.location.origin}/mcp`
  const snippet = snippetOf(kind, url, secret)

  const copySecret = async () => {
    if (await copyWithFallback(secret, secretRef.current, '令牌已复制')) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div>
      <div className="rounded-card bg-surface p-1.5 shadow-raise">
        <div className="flex items-center gap-2.5 rounded-well bg-well py-3.5 pr-3 pl-3.5 shadow-well">
          <span
            ref={secretRef}
            onClick={() => selectNode(secretRef.current)}
            className="min-w-0 flex-1 cursor-text font-mono text-[14px] font-medium tracking-[0.01em] break-all select-all"
          >
            {text}
          </span>
          <Button size="sm" variant={copied ? 'secondary' : 'primary'} autoFocus={autoFocus} onClick={() => void copySecret()}>
            {copied ? <Check weight="bold" /> : <Copy />}
            {copied ? '已复制' : '复制'}
          </Button>
        </div>
        <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5 text-[12.5px] text-warn">
          <WarningCircle size={15} weight="fill" className="shrink-0" />
          仅显示这一次。关闭后网关只保存它的哈希，丢失了只能撤销重建。
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        <span className="text-[12.5px] font-medium">接入 Agent</span>
        <Segmented
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'claude', label: 'Claude Code' },
            { value: 'json', label: '通用 JSON' },
          ]}
          aria-label="配置格式"
        />
      </div>
      <div className="relative mt-2.5 rounded-[12px] bg-well shadow-well">
        <pre
          ref={snippetRef}
          className={cn('m-0 overflow-x-auto py-3 pr-12 pl-3.5 font-mono text-[11.5px] leading-[1.7] whitespace-pre text-ink-2')}
        >
          {snippet}
        </pre>
        <button
          type="button"
          aria-label="复制配置"
          title="复制配置"
          onClick={() => void copyWithFallback(snippet, snippetRef.current, '配置已复制')}
          className="absolute top-2 right-2 grid size-7 place-items-center rounded-[8px] text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink active:scale-90"
        >
          <Copy size={14} />
        </button>
      </div>
    </div>
  )
}

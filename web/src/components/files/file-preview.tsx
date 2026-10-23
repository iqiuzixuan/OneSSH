import { ArrowSquareOut, DownloadSimple, File, FileX, WarningCircle } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { downloadUrl, UNAUTHORIZED_EVENT } from '@/api/client'
import type { FileEntry } from '@/api/types'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/code'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'
import { formatAgo, formatBytes } from '@/lib/format'
import { spring } from '@/lib/motion'

/** 浏览器内预览的上限：再大就只提供下载，免得把整块文件拉进 JS 堆 */
const MAX_PREVIEW_BYTES = 512 * 1024
const MAX_LINES = 4000
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|ico|bmp)$/i
const BINARY_RE =
  /\.(gz|tgz|zip|xz|bz2|zst|7z|rar|tar|jar|war|so|dylib|dll|exe|bin|o|a|class|pyc|db|sqlite3?|wasm|woff2?|ttf|otf|pdf|mp[34]|mov|mkv|iso|img|dump|pem\.enc)$/i

export type PreviewKind = 'image' | 'text' | 'binary' | 'large'

export function previewKind(entry: FileEntry): PreviewKind {
  if (IMAGE_RE.test(entry.name)) return 'image'
  if (BINARY_RE.test(entry.name)) return 'binary'
  if (entry.size > MAX_PREVIEW_BYTES) return 'large'
  return 'text'
}

export function startDownload(hostId: number, path: string, name: string) {
  const anchor = document.createElement('a')
  anchor.href = downloadUrl(hostId, path)
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

type TextBody = { binary: true } | { binary: false; text: string }

async function fetchText(hostId: number, path: string): Promise<TextBody> {
  const response = await fetch(downloadUrl(hostId, path), { credentials: 'same-origin' })
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    let message = response.statusText
    try {
      message = ((await response.json()) as { error?: string }).error || message
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(message)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  // 前 8 KB 出现 NUL 字节就当二进制——与 git / grep 的判定一致
  if (bytes.subarray(0, 8192).includes(0)) return { binary: true }
  return { binary: false, text: new TextDecoder('utf-8').decode(bytes) }
}

/** 带行号的等宽代码视图；注释行降一档，别的不上色——静流的预览只做阅读，不做 IDE */
function CodeView({ text }: { text: string }) {
  const all = text.replace(/\n$/, '').split('\n')
  const lines = all.slice(0, MAX_LINES)
  const gutter = String(lines.length).length
  return (
    <div className="max-h-[min(640px,calc(100dvh-280px))] overflow-auto rounded-well bg-well shadow-well">
      <pre className="m-0 py-2.5 font-mono text-[12px] leading-[1.75]">
        {lines.map((line, i) => {
          const comment = /^\s*(#|\/\/|;|--)/.test(line)
          return (
            <span key={i} className="flex">
              <span
                aria-hidden
                className="sticky left-0 shrink-0 bg-well pr-3.5 pl-2.5 text-right text-ink-4 select-none"
                style={{ width: `calc(${gutter}ch + 24px)` }}
              >
                {i + 1}
              </span>
              <span className={cn('pr-4 whitespace-pre', comment ? 'text-ink-3' : 'text-ink')}>{line || ' '}</span>
            </span>
          )
        })}
      </pre>
      {all.length > MAX_LINES && (
        <p className="border-t border-line px-3.5 py-2 text-[12px] text-ink-3">只显示前 {MAX_LINES} 行，完整内容请下载。</p>
      )}
    </div>
  )
}

/**
 * 文件预览卡：文本带行号、图片按原比例、二进制与大文件只给下载。
 * 内容走与下载同一个端点，网关侧的权限与审计一致。
 */
export function FilePreview({ hostId, dir, entry }: { hostId: number; dir: string; entry?: FileEntry }) {
  const path = entry ? `${dir.replace(/\/$/, '')}/${entry.name}` : ''
  const kind = entry ? previewKind(entry) : undefined
  const text = useQuery({
    queryKey: ['sftp-preview', hostId, path, entry?.mtime, entry?.size],
    queryFn: () => fetchText(hostId, path),
    enabled: kind === 'text',
    staleTime: 30_000,
    retry: false,
  })

  if (!entry) {
    return (
      <EmptyState
        icon={<File />}
        title="选择一个文件预览"
        description="文本带行号直接阅读，图片按原比例显示；二进制或超过 512 KB 的文件只提供下载。"
      />
    )
  }

  const body = text.data
  const lineCount = body && !body.binary ? body.text.replace(/\n$/, '').split('\n').length : null

  const download = (
    <Button size="sm" variant="ghost" onClick={() => startDownload(hostId, path, entry.name)}>
      <DownloadSimple />
      下载
    </Button>
  )

  return (
    <motion.div key={path} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.soft} className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-2 px-2 pt-2 pb-2.5">
        <h3 className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-medium" title={path}>
          {path}
        </h3>
        {kind === 'text' && body && !body.binary && <CopyButton value={body.text} label="复制内容" message="内容已复制" />}
        {kind === 'image' && (
          <Button size="sm" variant="ghost" onClick={() => window.open(downloadUrl(hostId, path), '_blank', 'noopener')}>
            <ArrowSquareOut />
            新标签打开
          </Button>
        )}
        {download}
      </div>

      {kind === 'image' ? (
        <div className="grid min-h-[240px] place-items-center rounded-well bg-well p-4 shadow-well bg-[repeating-conic-gradient(var(--well-2)_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
          <img
            src={downloadUrl(hostId, path)}
            alt={entry.name}
            className="max-h-[min(560px,calc(100dvh-320px))] max-w-full rounded-[6px] outline outline-1 -outline-offset-1 outline-black/10"
          />
        </div>
      ) : kind === 'text' && text.isPending ? (
        <div className="space-y-2 rounded-well bg-well p-3.5 shadow-well">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-3" style={{ width: `${40 + ((i * 37) % 55)}%` }} />
          ))}
        </div>
      ) : kind === 'text' && text.isError ? (
        <EmptyState
          icon={<WarningCircle />}
          title="读取失败"
          description={(text.error as Error).message}
          action={
            <Button size="sm" onClick={() => void text.refetch()}>
              重试
            </Button>
          }
        />
      ) : kind === 'text' && body && !body.binary ? (
        <CodeView text={body.text} />
      ) : (
        <EmptyState
          icon={<FileX />}
          title={`无法预览 ${entry.name}`}
          description={
            kind === 'large'
              ? `文件有 ${formatBytes(entry.size)}，超过 512 KB 的文件不在浏览器内预览。`
              : '这是一个二进制文件，浏览器里看不出有用的内容。'
          }
          action={download}
        />
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-2.5 pt-2.5 pb-1.5 font-mono text-[11.5px] text-ink-3">
        <span>{formatBytes(entry.size)}</span>
        {lineCount != null && <span>{lineCount} 行</span>}
        <span>{entry.mode}</span>
        <span title={new Date(entry.mtime * 1000).toLocaleString('zh-CN', { hour12: false })}>修改于 {formatAgo(entry.mtime * 1000)}</span>
      </div>
    </motion.div>
  )
}

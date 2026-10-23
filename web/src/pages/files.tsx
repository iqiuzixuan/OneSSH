import {
  ArrowBendLeftUp,
  ArrowClockwise,
  DownloadSimple,
  FileText,
  Folder,
  FolderOpen,
  HardDrives,
  LinkSimple,
  PencilSimple,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { checkDownload } from '@/api/client'
import { useHosts, useSftpList, useUpload } from '@/api/queries'
import type { FileEntry } from '@/api/types'
import { FilePreview, startDownload } from '@/components/files/file-preview'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { Select } from '@/components/ui/select'
import { SelectionBar } from '@/components/ui/selection-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { formatAgo, formatBytes, formatTime } from '@/lib/format'
import { staggerItem } from '@/lib/motion'

const HOME = '~'
const ROW = 'grid grid-cols-[20px_minmax(0,1fr)_64px_84px] items-center gap-2.5 md:grid-cols-[20px_minmax(0,1fr)_64px_84px_88px]'

const join = (dir: string, name: string) => `${dir.replace(/\/$/, '')}/${name}`

/** 上一级目录；家目录本身与根目录没有可回退的上级 */
function parentOf(path: string): string | null {
  if (path === '/' || path === HOME) return null
  const trimmed = path.replace(/\/$/, '')
  const cut = trimmed.lastIndexOf('/')
  if (cut < 0) return null
  if (cut === 0) return '/'
  return trimmed.slice(0, cut)
}

/** 面包屑：每一段都可点回去，末段是所在位置；路径深时自动滚到末尾，并可切换为输入框直接改 */
function Breadcrumbs({ path, onGo }: { path: string; onGo: (path: string) => void }) {
  const [draft, setDraft] = useState<string>()
  const ref = useRef<HTMLElement>(null)
  const absolute = path.startsWith('/')
  const segments = path.split('/').filter(Boolean)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [path, draft])

  const commit = () => {
    if (draft == null) return
    const next = draft.trim()
    setDraft(undefined)
    if (next && next !== path) onGo(next)
  }

  if (draft != null) {
    return (
      <Input
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setDraft(undefined)
        }}
        spellCheck={false}
        aria-label="路径"
        className="font-mono text-[12.5px]"
        wrapperClassName="h-7"
      />
    )
  }

  const crumbs = [
    ...(absolute ? [{ label: '/', to: '/' }] : []),
    ...segments.map((segment, i) => ({
      label: segment,
      to: (absolute ? '/' : '') + segments.slice(0, i + 1).join('/'),
    })),
  ]

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <nav
        ref={ref}
        aria-label="当前路径"
        className="flex min-w-0 items-center overflow-x-auto font-mono text-[12.5px] text-ink-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1
          return (
            <span key={crumb.to} className="flex shrink-0 items-center">
              {i > 0 && crumbs[i - 1].label !== '/' && <span className="px-px text-ink-4">/</span>}
              {last ? (
                <span className="px-1.5 py-[3px] font-medium text-ink">{crumb.label}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onGo(crumb.to)}
                  className="max-w-[12rem] truncate rounded-[6px] px-1.5 py-[3px] transition-colors hover:bg-hover-2 hover:text-ink"
                >
                  {crumb.label}
                </button>
              )}
            </span>
          )
        })}
      </nav>
      <Tooltip content="编辑路径">
        <Button size="icon-sm" variant="ghost" onClick={() => setDraft(path)} aria-label="编辑路径">
          <PencilSimple />
        </Button>
      </Tooltip>
    </div>
  )
}

function EntryIcon({ entry }: { entry: FileEntry }) {
  if (entry.directory) return <Folder size={16} weight="fill" className="text-ink-3" />
  if (entry.symlink_target) return <LinkSimple size={16} className="text-ink-3" />
  return <FileText size={16} className="text-ink-3" />
}

export function FilesPage() {
  const [params, setParams] = useSearchParams()
  const hostRaw = params.get('host')
  const host = hostRaw && Number.isFinite(Number(hostRaw)) ? Number(hostRaw) : undefined
  const path = params.get('path') || HOME
  const fileName = params.get('file') ?? undefined

  const hosts = useHosts()
  const query = useSftpList(host, path)
  const upload = useUpload(host, path)
  const fileInput = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [dragging, setDragging] = useState(false)
  // 下载可能跨越主机 / 目录切换；递增作用域阻止旧请求把失败项写回新目录
  const selectionScope = useRef(0)

  useEffect(() => {
    selectionScope.current++
    setSelected(new Set())
  }, [host, path])

  const entries = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, 'zh-CN'),
      ),
    [query.data],
  )
  const files = entries.filter((e) => !e.directory)
  const previewEntry = fileName ? entries.find((e) => e.name === fileName && !e.directory) : undefined
  const parent = parentOf(path)
  const currentHost = hosts.data?.find((h) => h.id === host)

  const update = (patch: Record<string, string | undefined>, replace = false) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value == null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace })
  }
  const go = (nextPath: string) => update({ path: nextPath === HOME ? undefined : nextPath, file: undefined })

  const open = (entry: FileEntry) => {
    if (entry.directory) go(join(path, entry.name))
    else update({ file: entry.name }, true)
  }

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const uploadFiles = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      try {
        await upload.mutateAsync(file)
      } catch {
        // 失败提示由 mutation 的统一 onError 给，这里继续传下一个
      }
    }
  }

  /** 先 HEAD 验证，再交给浏览器原生下载栈流式处理；串行预检避免瞬间压满 SFTP 连接 */
  const downloadSelected = async () => {
    if (host == null || downloading) return
    const names = [...selected]
    const scope = selectionScope.current
    const failed: string[] = []
    let firstError: string | undefined
    setDownloading(true)
    try {
      for (const name of names) {
        try {
          await checkDownload(host, join(path, name))
          startDownload(host, join(path, name), name)
        } catch (error) {
          failed.push(name)
          firstError ??= (error as Error).message
        }
      }
    } finally {
      setDownloading(false)
    }
    const ok = names.length - failed.length
    if (failed.length === 0) toast.success(`已开始下载 ${ok} 个文件`)
    else if (ok === 0) toast.error(`下载失败：${firstError ?? '未知错误'}`)
    else toast.warning(`已开始下载 ${ok} 个文件，${failed.length} 个失败`)
    if (selectionScope.current === scope) setSelected(new Set(failed))
  }

  const errorMessage = query.error instanceof Error ? query.error.message : undefined
  const selecting = selected.size > 0

  return (
    <PageTransition>
      <PageHeader
        title="文件"
        description="经 SFTP 浏览与读取。Agent 的写入是原子的，编辑带 expected_sha256 乐观锁——并发修改不会被悄悄覆盖。"
        actions={
          <>
            <Select
              className="w-52"
              value={host}
              onChange={(next) => setParams({ host: String(next) })}
              options={(hosts.data ?? []).map((h) => ({ value: h.id, label: h.name, description: h.tags[0] }))}
              placeholder="选择主机"
              aria-label="选择主机"
            />
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget
                if (input.files?.length) void uploadFiles(input.files)
                // 同名文件也应能连续上传，每次选择后清空原生输入值
                input.value = ''
              }}
            />
            <Button loading={upload.isPending} disabled={host == null} onClick={() => fileInput.current?.click()}>
              <UploadSimple />
              上传
            </Button>
          </>
        }
      />

      {host == null ? (
        <motion.div variants={staggerItem}>
          <Card>
            <EmptyState
              icon={<HardDrives />}
              title="选择一台主机"
              description="选好主机后即可浏览它的文件系统、预览文本与图片、上传和批量下载。"
              action={
                (hosts.data?.length ?? 0) > 0 && (
                  <div className="flex max-w-xl flex-wrap justify-center gap-1.5">
                    {hosts.data!.slice(0, 10).map((h) => (
                      <Button key={h.id} size="sm" onClick={() => setParams({ host: String(h.id) })} className="font-mono">
                        {h.name}
                      </Button>
                    ))}
                  </div>
                )
              }
            />
          </Card>
        </motion.div>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <motion.div variants={staggerItem}>
            <Card
              className="relative p-1.5"
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files)
              }}
            >
              <div className="flex min-w-0 items-center gap-2 px-2 pt-2 pb-2.5">
                <Breadcrumbs path={path} onGo={go} />
                <span className="shrink-0 font-mono text-[11.5px] text-ink-3">
                  {query.data ? `${query.data.length} 项` : ''}
                </span>
                <Tooltip content="刷新">
                  <Button size="icon-sm" variant="ghost" onClick={() => void query.refetch()} aria-label="刷新目录">
                    <ArrowClockwise className={query.isFetching ? 'animate-spin' : undefined} />
                  </Button>
                </Tooltip>
              </div>

              {query.isError ? (
                <EmptyState
                  icon={<WarningCircle />}
                  title="无法读取目录"
                  description={<code className="font-mono text-[12px] break-all">{errorMessage ?? '连接目标主机失败'}</code>}
                  action={
                    <div className="flex gap-2">
                      {parent && <Button onClick={() => go(parent)}>返回上一级</Button>}
                      <Button variant="primary" loading={query.isFetching} onClick={() => void query.refetch()}>
                        重试
                      </Button>
                    </div>
                  }
                />
              ) : query.isPending ? (
                <div className="space-y-2 px-2.5 py-2">
                  {Array.from({ length: 7 }, (_, i) => (
                    <Skeleton key={i} className="h-5" />
                  ))}
                </div>
              ) : (
                <div className={cn('transition-opacity duration-150', query.isFetching && 'opacity-70')}>
                  {files.length > 0 && (
                    <div className={cn(ROW, 'h-8 px-2.5 text-[12px] text-ink-3')}>
                      <Checkbox
                        aria-label="选择全部文件"
                        checked={selected.size === 0 ? false : selected.size === files.length ? true : 'indeterminate'}
                        onCheckedChange={() =>
                          setSelected(selected.size === files.length ? new Set() : new Set(files.map((f) => f.name)))
                        }
                      />
                      <span>名称</span>
                      <span className="text-right">大小</span>
                      <span className="text-right">修改</span>
                      <span className="hidden text-right md:block">权限</span>
                    </div>
                  )}
                  {parent && (
                    <button type="button" onClick={() => go(parent)} className={cn(ROW, 'h-9 w-full rounded-well px-2.5 text-left transition-colors hover:bg-hover')}>
                      <ArrowBendLeftUp size={15} className="text-ink-3" />
                      <span className="font-mono text-[12.5px] text-ink-2">..</span>
                    </button>
                  )}
                  {entries.length === 0 ? (
                    <EmptyState
                      icon={<FolderOpen />}
                      title="目录为空"
                      description={
                        <>
                          <code className="font-mono text-[12px]">{path}</code> 里没有文件。可以把文件拖进来上传。
                        </>
                      }
                    />
                  ) : (
                    entries.map((entry) => {
                      const on = entry.name === fileName && !entry.directory
                      const checked = selected.has(entry.name)
                      return (
                        <div
                          key={entry.name}
                          role="button"
                          tabIndex={0}
                          onClick={() => open(entry)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              open(entry)
                            }
                          }}
                          className={cn(
                            ROW,
                            'group/file h-9 cursor-pointer rounded-well px-2.5 transition-colors duration-150 focus-visible:outline-none',
                            on || checked ? 'bg-well-2' : 'hover:bg-hover focus-visible:bg-hover',
                          )}
                        >
                          {/* 图标位悬停或已有选择时换成勾选框；目录不能下载，只显示图标 */}
                          <span className="grid place-items-center" onClick={(event) => !entry.directory && event.stopPropagation()}>
                            {entry.directory ? (
                              <EntryIcon entry={entry} />
                            ) : (
                              <>
                                <span className={cn(selecting || checked ? 'hidden' : 'group-hover/file:hidden')}>
                                  <EntryIcon entry={entry} />
                                </span>
                                <Checkbox
                                  aria-label={`选择 ${entry.name}`}
                                  checked={checked}
                                  onCheckedChange={() => toggle(entry.name)}
                                  className={cn(selecting || checked ? 'grid' : 'hidden group-hover/file:grid')}
                                />
                              </>
                            )}
                          </span>
                          <span className="min-w-0 truncate font-mono text-[12.5px]" title={entry.name}>
                            {entry.name}
                            {entry.directory && <span className="text-ink-3">/</span>}
                            {entry.symlink_target && <span className="text-ink-3"> → {entry.symlink_target}</span>}
                          </span>
                          <span className="text-right font-mono text-[11.5px] text-ink-3">{entry.directory ? '—' : formatBytes(entry.size)}</span>
                          <span className="text-right font-mono text-[11.5px] text-ink-3" title={formatTime(entry.mtime)}>
                            {formatAgo(entry.mtime * 1000)}
                          </span>
                          <span className="hidden text-right font-mono text-[11.5px] text-ink-3 md:block">{entry.mode}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              <AnimatePresence>
                {dragging && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-1.5 grid place-items-center rounded-well bg-surface/90 shadow-[inset_0_0_0_1.5px_var(--ink-3)] backdrop-blur-[2px]"
                  >
                    <div className="text-center">
                      <UploadSimple size={22} className="mx-auto mb-2 text-ink-2" />
                      <p className="text-[13px] font-medium">松开以上传</p>
                      <p className="mt-0.5 font-mono text-[12px] text-ink-3">
                        {currentHost?.name}:{path}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem} className="lg:sticky lg:top-5">
            <Card className="p-1.5">
              <FilePreview hostId={host} dir={path} entry={previewEntry} />
            </Card>
          </motion.div>
        </div>
      )}

      <SelectionBar
        count={selected.size}
        onClear={() => {
          selectionScope.current++
          setSelected(new Set())
        }}
      >
        <button
          type="button"
          disabled={downloading}
          onClick={() => void downloadSelected()}
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium disabled:opacity-60"
        >
          <DownloadSimple size={14} />
          {downloading ? '下载中…' : '下载'}
        </button>
      </SelectionBar>
    </PageTransition>
  )
}

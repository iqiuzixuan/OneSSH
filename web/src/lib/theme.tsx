import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'onessh-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
/** 与 global.css 中 --bg 保持一致，供 <meta name="theme-color"> 使用 */
const BG: Record<ResolvedTheme, string> = { light: '#f6f7f9', dark: '#0f1116' }

/* ── 主题色 ─────────────────────────────────────────────────── */
export type AccentName = 'violet' | 'teal' | 'blue' | 'orange' | 'rose'
const ACCENT_KEY = 'onessh-accent'
const ACCENTS: AccentName[] = ['violet', 'teal', 'blue', 'orange', 'rose']

/** 顶栏色板与命令面板共用：展示名 + 色板圆点颜色（浅色档的 accent 值） */
export const ACCENT_META: Record<AccentName, { label: string; swatch: string }> = {
  violet: { label: '紫罗兰', swatch: '#6e56cf' },
  teal: { label: '青', swatch: '#0d9488' },
  blue: { label: '蓝', swatch: '#2563eb' },
  orange: { label: '橙', swatch: '#ea580c' },
  rose: { label: '玫瑰', swatch: '#e11d48' },
}

function readStoredAccent(): AccentName {
  const stored = localStorage.getItem(ACCENT_KEY) as AccentName | null
  return stored && ACCENTS.includes(stored) ? stored : 'violet'
}

type ThemeContextValue = {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (m: ThemeMode) => void
  accent: AccentName
  setAccent: (a: AccentName) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)
  const [accent, setAccentState] = useState<AccentName>(readStoredAccent)
  const [systemDark, setSystemDark] = useState(() => matchMedia(DARK_QUERY).matches)

  // system 模式下跟随操作系统实时翻转
  useEffect(() => {
    const mql = matchMedia(DARK_QUERY)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[resolved])
  }, [resolved])

  // violet 是 :root 默认值，不挂属性；其余经 html[data-accent] 命中 global.css 的预设块
  useEffect(() => {
    if (accent === 'violet') delete document.documentElement.dataset.accent
    else document.documentElement.dataset.accent = accent
  }, [accent])

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next)
    setModeState(next)
  }, [])

  const setAccent = useCallback((next: AccentName) => {
    localStorage.setItem(ACCENT_KEY, next)
    setAccentState(next)
  }, [])

  const value = useMemo(
    () => ({ mode, resolved, setMode, accent, setAccent }),
    [mode, resolved, setMode, accent, setAccent],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用')
  return ctx
}

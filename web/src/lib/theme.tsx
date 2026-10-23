import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'onessh-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
/** 与 global.css 中 --bg 保持一致，供 <meta name="theme-color"> 使用 */
const BG: Record<ResolvedTheme, string> = { light: '#f7f7f5', dark: '#131312' }

type ThemeContextValue = {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (m: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

/**
 * 静流是单色界面，颜色只留给状态，所以只有明暗两档，不再提供主题色。
 * 旧版本写入的 onessh-accent 留在 localStorage 里不影响任何样式，这里顺手清掉。
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)
  const [systemDark, setSystemDark] = useState(() => matchMedia(DARK_QUERY).matches)

  useEffect(() => {
    localStorage.removeItem('onessh-accent')
    delete document.documentElement.dataset.accent
  }, [])

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

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next)
    setModeState(next)
  }, [])

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用')
  return ctx
}

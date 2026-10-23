import { lazy, Suspense, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { UNAUTHORIZED_EVENT } from '@/api/client'
import { AppShell } from '@/components/layout/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider, useTheme } from '@/lib/theme'
import { LoginPage } from '@/pages/login'

/**
 * 页面按路由懒加载：首屏只拉外壳与当前页，其余页面在第一次进入时才下载。
 * 终端（ghostty-web 的 WASM）与图表这类重依赖因此不会拖慢概览的首次打开。
 */
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const DashboardPage = page(() => import('@/pages/dashboard'), 'DashboardPage')
const HostsPage = page(() => import('@/pages/hosts'), 'HostsPage')
const KeysPage = page(() => import('@/pages/keys'), 'KeysPage')
const TokensPage = page(() => import('@/pages/tokens'), 'TokensPage')
const TerminalPage = page(() => import('@/pages/terminal'), 'TerminalPage')
const FilesPage = page(() => import('@/pages/files'), 'FilesPage')
const JobsPage = page(() => import('@/pages/jobs'), 'JobsPage')
const ActivityPage = page(() => import('@/pages/activity'), 'ActivityPage')
const MetricsPage = page(() => import('@/pages/metrics'), 'MetricsPage')
const MemoriesPage = page(() => import('@/pages/memories'), 'MemoriesPage')
const NotFoundPage = page(() => import('@/pages/not-found'), 'NotFoundPage')
const OAuthAuthorizePage = page(() => import('@/pages/oauth-authorize'), 'OAuthAuthorizePage')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
})

/** 任何请求拿到 401 都会广播事件，这里统一跳登录并记住来路 */
function AuthGuard() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const onUnauthorized = () => {
      if (location.pathname === '/login') return
      // 必须连查询串一起记：OAuth 授权入口的全部参数都在 search 里，丢了就只能让用户从客户端重来
      navigate('/login', {
        replace: true,
        state: { from: location.pathname + location.search },
      })
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [navigate, location.pathname, location.search])

  return null
}

/**
 * Toast 走右下角，样式贴合静流：表面色 + 弹层阴影 + 圆角 14，图标按状态着色。
 * Toaster 需要读主题，因此必须在 ThemeProvider 内部。
 */
function ThemedToaster() {
  const { resolved } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      theme={resolved}
      offset={20}
      gap={8}
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-[14px] !border-0 !bg-surface !text-ink !shadow-pop !px-3.5 !py-3 !gap-3 !items-start !font-sans',
          title: '!text-[13px] !font-medium !leading-snug',
          description: '!text-[12px] !text-ink-2 !leading-normal',
          icon: '!mt-px',
          success: '[&_[data-icon]]:!text-ok',
          error: '[&_[data-icon]]:!text-bad',
          warning: '[&_[data-icon]]:!text-warn',
          info: '[&_[data-icon]]:!text-ink-2',
          actionButton: '!bg-primary !text-primary-fg !rounded-[8px]',
          cancelButton: '!bg-well-2 !text-ink-2 !rounded-[8px]',
        },
      }}
    />
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            <BrowserRouter>
              <AuthGuard />
              <Suspense fallback={null}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                {/* 授权页是给第三方客户端看的独立全页，不套 AppShell 的导航与顶栏 */}
                <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  {/* 详情由路由驱动：同一页面组件挂在两条路由上，切换时不卸载，面板可直链、可后退关闭 */}
                  <Route path="hosts" element={<HostsPage />} />
                  <Route path="hosts/:id" element={<HostsPage />} />
                  <Route path="keys" element={<KeysPage />} />
                  <Route path="tokens" element={<TokensPage />} />
                  <Route path="tokens/new" element={<TokensPage />} />
                  <Route path="terminal" element={<TerminalPage />} />
                  <Route path="files" element={<FilesPage />} />
                  <Route path="jobs" element={<JobsPage />} />
                  <Route path="activity" element={<ActivityPage />} />
                  <Route path="activity/:runId" element={<ActivityPage />} />
                  <Route path="metrics" element={<MetricsPage />} />
                  <Route path="memories" element={<MemoriesPage />} />
                  {/* 未知路径仍留在 AppShell 内，用户可直接从侧边栏跳走 */}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
              </Suspense>
            </BrowserRouter>
            <ThemedToaster />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

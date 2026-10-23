import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { post } from '@/api/client'

/**
 * 退出登录：服务端下发过期 cookie（HttpOnly，前端删不掉），然后回到登录页。
 * 先跳转再清缓存：反过来的话，外壳上还挂着的查询会立刻用已失效的会话重拉一轮。
 */
export function useLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => post<{ ok: boolean }>('/logout', {}),
    onSuccess: () => {
      navigate('/login', { replace: true })
      window.setTimeout(() => queryClient.clear(), 0)
      toast.success('已退出登录')
    },
    onError: (error) => toast.error(`退出失败：${(error as Error).message}`),
  })
}

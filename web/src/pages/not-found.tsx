import { ArrowLeft, Compass } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kbd } from '@/components/ui/input'
import { PageTransition } from '@/components/ui/page-transition'
import { staggerItem } from '@/lib/motion'

export function NotFoundPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <PageTransition>
      <motion.div variants={staggerItem} className="mt-[10vh]">
        <Card className="mx-auto max-w-[560px]">
          <EmptyState
            icon={<Compass />}
            title="页面不存在"
            description={
              <>
                <code className="rounded-[5px] bg-well-2 px-1.5 py-px font-mono text-[12px] text-ink">{pathname}</code>{' '}
                不在控制台的路由表里。可能是链接过期，或者地址打错了。
              </>
            }
            action={
              <div className="flex flex-col items-center gap-3">
                <Button variant="primary" onClick={() => navigate('/')}>
                  <ArrowLeft />
                  返回概览
                </Button>
                <span className="text-[12px] text-ink-3">
                  或按 <Kbd>⌘K</Kbd> 搜索主机与页面
                </span>
              </div>
            }
          />
        </Card>
      </motion.div>
    </PageTransition>
  )
}

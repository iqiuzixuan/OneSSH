import { motion } from 'motion/react'
import { staggerContainer } from '@/lib/motion'

/**
 * 页面根容器：首次挂载时子项依次入场（PageHeader 与用 <Stagger> 包起来的块）。
 * 只在挂载时播放一次——实时数据刷新不会重放整页入场。
 */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerContainer} initial="hidden" animate="visible">
      {children}
    </motion.div>
  )
}

export { staggerItem } from '@/lib/motion'

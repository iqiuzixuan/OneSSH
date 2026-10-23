import { motion } from 'motion/react'
import { staggerItem } from '@/lib/motion'

/**
 * 页头：等宽小字 eyebrow（日期、网关地址等上下文）+ 24px 标题 + 一句说明 + 右侧动作。
 * 说明句要回答「这页能帮我做什么」，不是重复标题。
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <motion.div
      variants={staggerItem}
      className="mt-1.5 mb-[22px] flex flex-col items-start justify-between gap-4 md:flex-row md:items-end md:gap-6"
    >
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 font-mono text-[11.5px] font-medium tracking-[0.01em] text-ink-3">{eyebrow}</div>}
        <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  )
}

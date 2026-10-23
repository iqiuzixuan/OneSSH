import type { Transition, Variants } from 'motion/react'

/**
 * 静流的动效只有四档，全部是可打断的弹簧：
 * - soft：默认的位移 / 尺寸变化，几乎不回弹
 * - enter：视图与列表的入场，比 soft 稍慢，配合模糊淡入
 * - snap：开关、分段指示器、导航高亮这类跟手的小部件
 * - exit：退出永远比进入快，不让用户等关闭动画
 */
export const spring = {
  soft: { type: 'spring', visualDuration: 0.3, bounce: 0.1 },
  enter: { type: 'spring', visualDuration: 0.38, bounce: 0.08 },
  snap: { type: 'spring', visualDuration: 0.24, bounce: 0.15 },
  exit: { type: 'spring', visualDuration: 0.18, bounce: 0 },
} satisfies Record<string, Transition>

/** 遮罩只做透明度，时长固定，避免和面板弹簧互相拖拽 */
export const scrimTransition: Transition = { duration: 0.18, ease: 'easeOut' }

/** 列表 / 网格容器：子项 40ms 依次入场，封顶约 8 项（超过的同时出现），只在首次挂载时播放 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
}

/** 入场子项：轻微上浮 + 模糊淡入 */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 6, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: spring.enter },
}

/** 页面进场 */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 6, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: spring.enter },
}

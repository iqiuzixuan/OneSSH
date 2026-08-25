import {
  Brain,
  Broadcast,
  ChartLine,
  FolderOpen,
  HardDrives,
  Key,
  Pulse,
  SquaresFour,
  Terminal,
  Ticket,
  type Icon,
} from '@phosphor-icons/react'

export type NavItem = { to: string; label: string; icon: Icon }
export type NavGroup = { title?: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  { items: [{ to: '/', label: '概览', icon: SquaresFour }] },
  {
    title: '资源',
    items: [
      { to: '/hosts', label: '主机', icon: HardDrives },
      { to: '/keys', label: '密钥', icon: Key },
      { to: '/tokens', label: '令牌', icon: Ticket },
    ],
  },
  {
    title: '操作',
    items: [
      { to: '/terminal', label: '终端', icon: Terminal },
      { to: '/files', label: '文件', icon: FolderOpen },
      { to: '/jobs', label: '任务', icon: Broadcast },
    ],
  },
  {
    title: '观测',
    items: [
      { to: '/activity', label: '活动', icon: Pulse },
      { to: '/metrics', label: '指标', icon: ChartLine },
      { to: '/memories', label: '记忆', icon: Brain },
    ],
  },
]

/** 扁平导航项：顶部标签页使用，与抽屉分组共用同一份导航数据 */
export const navItems = navGroups.flatMap((g) => g.items)

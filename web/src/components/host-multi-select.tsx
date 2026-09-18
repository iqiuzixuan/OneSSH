import type { Host } from '@/api/types'
import { MultiSelect } from '@/components/ui/multi-select'

/** 两种授权入口共用主机筛选；提交值始终是明确选中的主机 ID。 */
export function HostMultiSelect({
  hosts,
  value,
  onChange,
  id,
  invalid,
}: {
  hosts: Host[]
  value: number[]
  onChange: (value: number[]) => void
  id?: string
  invalid?: boolean
}) {
  return (
    <div className="space-y-2">
      <MultiSelect
        id={id}
        value={value}
        onChange={onChange}
        invalid={invalid}
        allowSelectAll
        searchPlaceholder="搜索标签、名称、地址、用户名或端口"
        emptyText="暂无可授权的主机"
        options={hosts.map((host) => {
          const addr = host.addr.includes(':') ? `[${host.addr}]` : host.addr
          return {
            value: host.id,
            label: host.name,
            description: [
              `${host.username}@${addr}:${host.port}`,
              host.tags.length > 0 ? `标签：${host.tags.join('、')}` : '无标签',
            ].join('\n'),
          }
        })}
      />
      <p className="text-[12px] leading-5 text-muted">
        空格分隔可组合多个条件；授权仅包含已选主机，新增同标签主机不会自动加入。
      </p>
    </div>
  )
}

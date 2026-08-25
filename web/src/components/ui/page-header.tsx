export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  /** 标题上方的等宽小写英文标识，如 OVERVIEW / HOSTS */
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="mb-1 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-accent-ink uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[22px] font-bold tracking-tight text-text">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

-- 区分「网关拒绝」与「执行失败」：两者 ok 都是 0，但对使用者的含义完全不同——
-- 前者是权限在起作用，后者是命令或远端出了问题。历史记录无法可靠回填，保持 0。
ALTER TABLE audit ADD COLUMN denied INTEGER NOT NULL DEFAULT 0;

-- 概览聚合按时间窗扫命令执行、按令牌取最新名字快照，补两条索引。
CREATE INDEX IF NOT EXISTS idx_command_runs_started ON command_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_audit_token ON audit(token_id, id);

package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// MaxAuditFilterValues 将单个筛选维度限制在 SQLite 常见变量上限以内。
// token 条件每项占 3 个变量；三个维度各 100 项时总计不超过 500。
const MaxAuditFilterValues = 100

// AddAudit 写入一条审计并返回其自增 id，实时事件用它把推送与列表行对上。
func (s *Store) AddAudit(ctx context.Context, a Audit) (int64, error) {
	var runIDs any
	if len(a.RunIDs) > 0 {
		encoded, err := json.Marshal(a.RunIDs)
		if err != nil {
			return 0, fmt.Errorf("编码命令执行关联: %w", err)
		}
		runIDs = string(encoded)
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	res, err := s.DB.ExecContext(ctx, `INSERT INTO audit(ts,token_id,token_name,tool,host,params_json,command_run_ids_json,ok,denied,exit_code,duration_ms,bytes_out) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, a.Ts, nullInt(a.TokenID), nullString(a.TokenName), a.Tool, nullString(a.Host), a.ParamsJSON, runIDs, boolInt(a.OK), boolInt(a.Denied), nullInt(a.ExitCode), a.DurationMS, a.BytesOut)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func validateAuditFilterCount(name string, count int) error {
	if count > MaxAuditFilterValues {
		return fmt.Errorf("审计%s筛选最多 %d 项", name, MaxAuditFilterValues)
	}
	return nil
}

// AuditQuery 是审计列表的筛选条件；零值即不过滤。OK 与 Denied 可以组合：
// OK=false 且 Denied=false 即「执行失败但不是被拒绝」。
type AuditQuery struct {
	TokenIDs []int64
	Hosts    []string
	Tools    []string
	OK       *bool
	Denied   *bool
	Before   int64
	Limit    int
}

func (s *Store) ListAudit(ctx context.Context, tokenIDs []int64, hosts, tools []string, ok *bool, before int64, limit int) ([]Audit, error) {
	return s.QueryAudit(ctx, AuditQuery{TokenIDs: tokenIDs, Hosts: hosts, Tools: tools, OK: ok, Before: before, Limit: limit})
}

func (s *Store) QueryAudit(ctx context.Context, f AuditQuery) ([]Audit, error) {
	tokenIDs, hosts, tools, ok, before, limit := f.TokenIDs, f.Hosts, f.Tools, f.OK, f.Before, f.Limit
	if err := validateAuditFilterCount("令牌", len(tokenIDs)); err != nil {
		return nil, err
	}
	if err := validateAuditFilterCount("主机", len(hosts)); err != nil {
		return nil, err
	}
	if err := validateAuditFilterCount("工具", len(tools)); err != nil {
		return nil, err
	}
	q := `SELECT id,ts,token_id,token_name,tool,host,params_json,command_run_ids_json,ok,denied,exit_code,duration_ms,bytes_out FROM audit WHERE 1=1`
	args := []any{}
	if len(tokenIDs) > 0 {
		// 迁移前的 ID 可能已被复用；当前令牌存在时，只接受写入时已快照其名称的记录。
		// 多值是 OR 关系：任一 id 命中即保留，每个 id 独立做名称快照校验。
		cond := `audit.token_id=? AND (
			NOT EXISTS (SELECT 1 FROM tokens WHERE tokens.id=?)
			OR EXISTS (
				SELECT 1 FROM tokens
				WHERE tokens.id=? AND audit.token_name=tokens.name
			)
		)`
		conds := make([]string, len(tokenIDs))
		for i, id := range tokenIDs {
			conds[i] = `(` + cond + `)`
			args = append(args, id, id, id)
		}
		q += ` AND (` + strings.Join(conds, ` OR `) + `)`
	}
	if len(hosts) > 0 {
		q += ` AND host IN (` + placeholders(len(hosts)) + `)`
		for _, h := range hosts {
			args = append(args, h)
		}
	}
	if len(tools) > 0 {
		q += ` AND tool IN (` + placeholders(len(tools)) + `)`
		for _, t := range tools {
			args = append(args, t)
		}
	}
	if ok != nil {
		q += ` AND ok=?`
		args = append(args, boolInt(*ok))
	}
	if f.Denied != nil {
		q += ` AND denied=?`
		args = append(args, boolInt(*f.Denied))
	}
	if before > 0 {
		q += ` AND id<?`
		args = append(args, before)
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q += ` ORDER BY id DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Audit, 0)
	for rows.Next() {
		var a Audit
		var ok, denied int
		var runIDs sql.NullString
		if err := rows.Scan(&a.ID, &a.Ts, &a.TokenID, &a.TokenName, &a.Tool, &a.Host, &a.ParamsJSON, &runIDs, &ok, &denied, &a.ExitCode, &a.DurationMS, &a.BytesOut); err != nil {
			return nil, err
		}
		if runIDs.Valid {
			if err := json.Unmarshal([]byte(runIDs.String), &a.RunIDs); err != nil {
				return nil, fmt.Errorf("解析审计命令执行关联: %w", err)
			}
		}
		a.OK = ok != 0
		a.Denied = denied != 0
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) ListAuditTools(ctx context.Context) ([]string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT DISTINCT tool FROM audit WHERE tool<>'' ORDER BY tool`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tools := make([]string, 0)
	for rows.Next() {
		var tool string
		if err := rows.Scan(&tool); err != nil {
			return nil, err
		}
		tools = append(tools, tool)
	}
	return tools, rows.Err()
}
func (s *Store) AddMetric(ctx context.Context, m Metric) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	_, err := s.DB.ExecContext(ctx, `INSERT OR REPLACE INTO metrics(host_id,ts,cpu_pct,mem_used_kb,mem_total_kb,load1,disks_json) VALUES(?,?,?,?,?,?,?)`, m.HostID, m.Ts, nullFloat(m.CPUPct), nullInt(m.MemUsedKB), nullInt(m.MemTotalKB), nullFloat(m.Load1), m.DisksJSON)
	return err
}
func (s *Store) LatestMetric(ctx context.Context, hostID int64) (Metric, error) {
	var m Metric
	err := s.DB.QueryRowContext(ctx, `SELECT host_id,ts,cpu_pct,mem_used_kb,mem_total_kb,load1,disks_json FROM metrics WHERE host_id=? ORDER BY ts DESC LIMIT 1`, hostID).Scan(&m.HostID, &m.Ts, &m.CPUPct, &m.MemUsedKB, &m.MemTotalKB, &m.Load1, &m.DisksJSON)
	return m, err
}
func (s *Store) MetricsSince(ctx context.Context, hostID, since int64) ([]Metric, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT host_id,ts,cpu_pct,mem_used_kb,mem_total_kb,load1,disks_json FROM metrics WHERE host_id=? AND ts>=? ORDER BY ts`, hostID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Metric, 0)
	for rows.Next() {
		var m Metric
		if err := rows.Scan(&m.HostID, &m.Ts, &m.CPUPct, &m.MemUsedKB, &m.MemTotalKB, &m.Load1, &m.DisksJSON); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
func (s *Store) CleanupMetrics(ctx context.Context, cutoff int64) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	_, err := s.DB.ExecContext(ctx, `DELETE FROM metrics WHERE ts<?`, cutoff)
	return err
}
func nullString(v sql.NullString) any {
	if v.Valid {
		return v.String
	}
	return nil
}

// placeholders 生成 IN 子句的 ? 占位串：placeholders(3) → "?,?,?"
func placeholders(n int) string {
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}
func nullFloat(v sql.NullFloat64) any {
	if v.Valid {
		return v.Float64
	}
	return nil
}
func NowAudit() int64 { return time.Now().UnixMilli() }

// AuditSummary 是控制台概览用的聚合统计，时间均为毫秒。
type AuditSummary struct {
	Since    int64            `json:"since"`
	Calls    int64            `json:"calls"`
	Denied   int64            `json:"denied"`
	Failed   int64            `json:"failed"`
	Buckets  []AuditBucket    `json:"buckets"`
	Tokens   []AuditTokenStat `json:"tokens"`
	Hosts    []AuditHostStat  `json:"hosts"`
	Commands CommandRunStat   `json:"commands"`
}

// AuditBucket 是一个时间片内的调用量；Buckets 按时间正序、连续无缺口，空片计 0。
type AuditBucket struct {
	Start  int64 `json:"start"`
	Calls  int64 `json:"calls"`
	Denied int64 `json:"denied"`
	Failed int64 `json:"failed"`
}

type AuditTokenStat struct {
	TokenID   int64  `json:"token_id"`
	TokenName string `json:"token_name"`
	Calls     int64  `json:"calls"`
	Denied    int64  `json:"denied"`
	LastAt    int64  `json:"last_at"`
}

type AuditHostStat struct {
	Host   string `json:"host"`
	Calls  int64  `json:"calls"`
	Denied int64  `json:"denied"`
	Failed int64  `json:"failed"`
	LastAt int64  `json:"last_at"`
}

type CommandRunStat struct {
	Total     int64 `json:"total"`
	Succeeded int64 `json:"succeeded"`
	Failed    int64 `json:"failed"`
	Running   int64 `json:"running"`
}

// SummarizeAudit 聚合 [since, now) 区间的审计与命令执行；bucketMS 是时间片宽度。
// 失败只计「执行失败」，被网关拒绝的单独计入 Denied，两者互斥。
func (s *Store) SummarizeAudit(ctx context.Context, since, bucketMS int64, now int64) (AuditSummary, error) {
	if bucketMS <= 0 {
		return AuditSummary{}, fmt.Errorf("时间片宽度必须为正")
	}
	out := AuditSummary{Since: since, Buckets: []AuditBucket{}, Tokens: []AuditTokenStat{}, Hosts: []AuditHostStat{}}
	if err := s.DB.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(denied),0), COALESCE(SUM(CASE WHEN ok=0 AND denied=0 THEN 1 ELSE 0 END),0)
		FROM audit WHERE ts>=? AND ts<?`, since, now).Scan(&out.Calls, &out.Denied, &out.Failed); err != nil {
		return out, err
	}

	n := int((now - since + bucketMS - 1) / bucketMS)
	for i := range n {
		out.Buckets = append(out.Buckets, AuditBucket{Start: since + int64(i)*bucketMS})
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT (ts-?)/?, COUNT(*), COALESCE(SUM(denied),0), COALESCE(SUM(CASE WHEN ok=0 AND denied=0 THEN 1 ELSE 0 END),0)
		FROM audit WHERE ts>=? AND ts<? GROUP BY 1`, since, bucketMS, since, now)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var i int
		var b AuditBucket
		if err := rows.Scan(&i, &b.Calls, &b.Denied, &b.Failed); err != nil {
			rows.Close()
			return out, err
		}
		if i >= 0 && i < len(out.Buckets) {
			out.Buckets[i].Calls, out.Buckets[i].Denied, out.Buckets[i].Failed = b.Calls, b.Denied, b.Failed
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	// 令牌名取区间内最新一条的快照：改过名的令牌显示当前名字。
	rows, err = s.DB.QueryContext(ctx, `SELECT token_id,
			(SELECT a2.token_name FROM audit a2 WHERE a2.token_id=audit.token_id AND a2.ts>=? ORDER BY a2.id DESC LIMIT 1),
			COUNT(*), COALESCE(SUM(denied),0), MAX(ts)
		FROM audit WHERE ts>=? AND ts<? AND token_id IS NOT NULL GROUP BY token_id ORDER BY COUNT(*) DESC`, since, since, now)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var t AuditTokenStat
		var name sql.NullString
		if err := rows.Scan(&t.TokenID, &name, &t.Calls, &t.Denied, &t.LastAt); err != nil {
			rows.Close()
			return out, err
		}
		t.TokenName = name.String
		out.Tokens = append(out.Tokens, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	rows, err = s.DB.QueryContext(ctx, `SELECT host, COUNT(*), COALESCE(SUM(denied),0), COALESCE(SUM(CASE WHEN ok=0 AND denied=0 THEN 1 ELSE 0 END),0), MAX(ts)
		FROM audit WHERE ts>=? AND ts<? AND host IS NOT NULL AND host<>'' GROUP BY host ORDER BY COUNT(*) DESC`, since, now)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var h AuditHostStat
		if err := rows.Scan(&h.Host, &h.Calls, &h.Denied, &h.Failed, &h.LastAt); err != nil {
			rows.Close()
			return out, err
		}
		out.Hosts = append(out.Hosts, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	// 运行中的命令不受时间窗限制：昨天开始、现在还在跑的训练任务也要算进来。
	err = s.DB.QueryRowContext(ctx, `SELECT
			COALESCE(SUM(CASE WHEN started_at>=? THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN started_at>=? AND status='succeeded' THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN started_at>=? AND status IN ('failed','timeout','lost') THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN status='running' THEN 1 ELSE 0 END),0)
		FROM command_runs WHERE started_at>=? OR status='running'`, since, since, since, since).
		Scan(&out.Commands.Total, &out.Commands.Succeeded, &out.Commands.Failed, &out.Commands.Running)
	return out, err
}

package store

import (
	"context"
	"database/sql"
	"testing"
)

func TestSummarizeAuditSeparatesDeniedFromFailed(t *testing.T) {
	ctx := context.Background()
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	const hour = int64(3_600_000)
	since := int64(10 * hour)
	now := since + 3*hour
	tok := func(id int64, name string) (sql.NullInt64, sql.NullString) {
		return sql.NullInt64{Int64: id, Valid: true}, sql.NullString{String: name, Valid: true}
	}
	host := func(name string) sql.NullString { return sql.NullString{String: name, Valid: true} }
	id1, name1 := tok(1, "claude")
	id2, name2 := tok(2, "codex")
	_, renamed := tok(1, "claude-code")
	rows := []Audit{
		// 窗口之前的记录不计入
		{Ts: since - 1, TokenID: id1, TokenName: name1, Tool: "exec", Host: host("web"), ParamsJSON: "{}", OK: true},
		{Ts: since + 10, TokenID: id1, TokenName: name1, Tool: "exec", Host: host("web"), ParamsJSON: "{}", OK: true},
		{Ts: since + 20, TokenID: id1, TokenName: name1, Tool: "exec", Host: host("web"), ParamsJSON: "{}", OK: false},
		{Ts: since + hour + 5, TokenID: id2, TokenName: name2, Tool: "exec", Host: host("db"), ParamsJSON: "{}", OK: false, Denied: true},
		{Ts: since + 2*hour + 7, TokenID: id1, TokenName: renamed, Tool: "file_read", Host: host("web"), ParamsJSON: "{}", OK: true},
	}
	for _, row := range rows {
		if _, err = st.AddAudit(ctx, row); err != nil {
			t.Fatal(err)
		}
	}

	got, err := st.SummarizeAudit(ctx, since, hour, now)
	if err != nil {
		t.Fatal(err)
	}
	if got.Calls != 4 || got.Denied != 1 || got.Failed != 1 {
		t.Fatalf("汇总 = calls %d denied %d failed %d", got.Calls, got.Denied, got.Failed)
	}
	if len(got.Buckets) != 3 {
		t.Fatalf("时间片数 = %d", len(got.Buckets))
	}
	if got.Buckets[0].Calls != 2 || got.Buckets[0].Failed != 1 || got.Buckets[1].Denied != 1 || got.Buckets[2].Calls != 1 {
		t.Fatalf("时间片 = %#v", got.Buckets)
	}
	if len(got.Tokens) != 2 || got.Tokens[0].TokenID != 1 || got.Tokens[0].Calls != 3 || got.Tokens[0].TokenName != "claude-code" {
		t.Fatalf("令牌统计 = %#v", got.Tokens)
	}
	if got.Tokens[0].LastAt != since+2*hour+7 || got.Tokens[1].Denied != 1 {
		t.Fatalf("令牌统计 = %#v", got.Tokens)
	}
	if len(got.Hosts) != 2 || got.Hosts[0].Host != "web" || got.Hosts[0].Calls != 3 || got.Hosts[0].Failed != 1 {
		t.Fatalf("主机统计 = %#v", got.Hosts)
	}
}

func TestSummarizeAuditCountsLongRunningCommands(t *testing.T) {
	ctx := context.Background()
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	const since = int64(1_000_000)
	runs := []struct {
		id      string
		started int64
		status  string
	}{
		{"old-running", since - 500, "running"},
		{"old-done", since - 400, "succeeded"},
		{"ok", since + 1, "succeeded"},
		{"bad", since + 2, "failed"},
		{"slow", since + 3, "timeout"},
	}
	for _, r := range runs {
		if err = st.CreateCommandRun(ctx, CommandRun{ID: r.id, Tool: "exec", Host: "web", Command: "true", Cwd: "~", Status: "running", StartedAt: r.started}); err != nil {
			t.Fatal(err)
		}
		if r.status != "running" {
			if err = st.FinishCommandRun(ctx, r.id, CommandRunFinish{Status: r.status, FinishedAt: r.started + 10}); err != nil {
				t.Fatal(err)
			}
		}
	}
	got, err := st.SummarizeAudit(ctx, since, 3_600_000, since+3_600_000)
	if err != nil {
		t.Fatal(err)
	}
	want := CommandRunStat{Total: 3, Succeeded: 1, Failed: 2, Running: 1}
	if got.Commands != want {
		t.Fatalf("命令统计 = %#v，期望 %#v", got.Commands, want)
	}
}

func TestQueryAuditFiltersDenied(t *testing.T) {
	ctx := context.Background()
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	for _, row := range []Audit{
		{Ts: 1, Tool: "exec", ParamsJSON: "{}", OK: true},
		{Ts: 2, Tool: "exec", ParamsJSON: "{}", OK: false},
		{Ts: 3, Tool: "exec", ParamsJSON: "{}", OK: false, Denied: true},
	} {
		if _, err = st.AddAudit(ctx, row); err != nil {
			t.Fatal(err)
		}
	}
	yes, no := true, false
	denied, err := st.QueryAudit(ctx, AuditQuery{Denied: &yes})
	if err != nil {
		t.Fatal(err)
	}
	if len(denied) != 1 || denied[0].Ts != 3 || !denied[0].Denied {
		t.Fatalf("拒绝筛选 = %#v", denied)
	}
	failed, err := st.QueryAudit(ctx, AuditQuery{OK: &no, Denied: &no})
	if err != nil {
		t.Fatal(err)
	}
	if len(failed) != 1 || failed[0].Ts != 2 {
		t.Fatalf("失败筛选 = %#v", failed)
	}
}

package webapi

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"onessh/internal/store"
)

func TestOverviewAndInfo(t *testing.T) {
	ctx := t.Context()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	if _, err = st.CreateHost(ctx, store.Host{Name: "web", Addr: "127.0.0.1", Port: 22, Username: "u", AuthType: "password"}); err != nil {
		t.Fatal(err)
	}
	now := store.NowAudit()
	for _, row := range []store.Audit{
		{Ts: now - 1000, Tool: "exec", Host: sql.NullString{String: "web", Valid: true}, ParamsJSON: "{}", OK: true},
		{Ts: now - 500, Tool: "exec", Host: sql.NullString{String: "web", Valid: true}, ParamsJSON: "{}", Denied: true},
	} {
		if _, err = st.AddAudit(ctx, row); err != nil {
			t.Fatal(err)
		}
	}
	api := &API{Store: st, Info: GatewayInfo{Version: "v9.9.9", StartedAt: 42, Listen: ":8866"}}
	handler := api.Handler()
	get := func(path string) *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		return response
	}

	response := get("/overview")
	if response.Code != http.StatusOK {
		t.Fatalf("概览状态码 = %d: %s", response.Code, response.Body.String())
	}
	var overview struct {
		WindowHours int                `json:"window_hours"`
		BucketMS    int64              `json:"bucket_ms"`
		Summary     store.AuditSummary `json:"summary"`
	}
	if err = json.Unmarshal(response.Body.Bytes(), &overview); err != nil {
		t.Fatal(err)
	}
	if overview.WindowHours != 24 || overview.BucketMS != 3_600_000 || len(overview.Summary.Buckets) != 24 {
		t.Fatalf("概览窗口 = %+v", overview)
	}
	if overview.Summary.Calls != 2 || overview.Summary.Denied != 1 {
		t.Fatalf("概览汇总 = %+v", overview.Summary)
	}
	if response = get("/overview?hours=0"); response.Code != http.StatusBadRequest {
		t.Fatalf("非法窗口状态码 = %d", response.Code)
	}
	if response = get("/overview?hours=1"); response.Code != http.StatusOK {
		t.Fatalf("1 小时窗口状态码 = %d", response.Code)
	}
	_ = json.Unmarshal(response.Body.Bytes(), &overview)
	if overview.BucketMS != 300_000 || len(overview.Summary.Buckets) != 12 {
		t.Fatalf("短窗口时间片 = %d × %d", overview.BucketMS, len(overview.Summary.Buckets))
	}

	response = get("/info")
	var info GatewayInfo
	if err = json.Unmarshal(response.Body.Bytes(), &info); err != nil || info.Version != "v9.9.9" || info.StartedAt != 42 {
		t.Fatalf("网关信息 = %s", response.Body.String())
	}

	// 没有连接池时主机仍要带 health，前端不需要判空。
	response = get("/hosts")
	var hosts []map[string]any
	if err = json.Unmarshal(response.Body.Bytes(), &hosts); err != nil {
		t.Fatal(err)
	}
	health, _ := hosts[0]["health"].(map[string]any)
	if len(hosts) != 1 || health["state"] != "unknown" {
		t.Fatalf("主机列表 = %s", response.Body.String())
	}
}

package webapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"onessh/internal/jobs"
	"onessh/internal/store"
)

// refresh=0 只读库里的状态：运行中的任务也不连远端核对（这里没有可用的连接池，
// 一旦走 Refresh 就会出错被丢掉），侧栏计数这类高频轮询因此不打扰主机。
func TestJobsListSnapshotSkipsRemoteRefresh(t *testing.T) {
	ctx := t.Context()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	host, err := st.CreateHost(ctx, store.Host{Name: "gpu", Addr: "127.0.0.1", Port: 22, Username: "u", AuthType: "password"})
	if err != nil {
		t.Fatal(err)
	}
	if err = st.CreateJob(ctx, store.Job{ID: "job-1", HostID: host.ID, Command: "train", Cwd: "~", Status: "running", StartedAt: 100}); err != nil {
		t.Fatal(err)
	}
	if err = st.UpdateJobLogBytes(ctx, "job-1", 42); err != nil {
		t.Fatal(err)
	}
	handler := (&API{Store: st, Jobs: &jobs.Manager{Store: st}}).Handler()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/jobs?refresh=0", nil))
	var out []jobs.Status
	if err = json.Unmarshal(response.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 || out[0].Job.Status != "running" || out[0].LogBytes != 42 {
		t.Fatalf("快照列表 = %s", response.Body.String())
	}
}

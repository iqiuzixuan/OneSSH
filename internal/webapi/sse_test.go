package webapi

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"onessh/internal/events"
)

// 网关空闲时也要立刻把响应头和首个字节刷给浏览器，否则 EventSource 不触发 onopen，
// 控制台会一直显示「正在连接」；之后靠心跳注释保活。
func TestSSEFlushesImmediatelyAndSendsHeartbeat(t *testing.T) {
	old := sseHeartbeat
	sseHeartbeat = 30 * time.Millisecond
	defer func() { sseHeartbeat = old }()

	bus := events.New()
	server := httptest.NewServer((&API{Events: bus}).Handler())
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+"/events", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if got := resp.Header.Get("X-Accel-Buffering"); got != "no" {
		t.Fatalf("X-Accel-Buffering = %q", got)
	}
	reader := bufio.NewReader(resp.Body)
	readLine := func() string {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("读取 SSE 失败: %v", err)
		}
		return strings.TrimSpace(line)
	}
	if line := readLine(); line != ": connected" {
		t.Fatalf("首行 = %q", line)
	}
	readLine() // 空行
	if line := readLine(); line != ": ping" {
		t.Fatalf("心跳 = %q", line)
	}
	readLine()
	bus.Publish("tool_call", map[string]any{"tool": "exec"})
	for {
		line := readLine()
		if strings.HasPrefix(line, "data: ") {
			if !strings.Contains(line, `"tool_call"`) {
				t.Fatalf("事件 = %q", line)
			}
			return
		}
	}
}

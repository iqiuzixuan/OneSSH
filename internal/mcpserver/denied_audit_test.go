package mcpserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"onessh/internal/events"
	"onessh/internal/store"
)

// 处理函数把「主机未授权」转成普通文本错误返回，审计仍要能认出这是网关拒绝而不是执行失败，
// 实时事件也要带上令牌身份，控制台才能画出「谁想去哪、被拦下了」。
func TestUnauthorizedHostIsAuditedAsDenied(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	if _, err = st.CreateHost(ctx, store.Host{Name: "db-01", Addr: "127.0.0.1", Port: 22, Username: "u", AuthType: "password"}); err != nil {
		t.Fatal(err)
	}
	token, err := st.CreateToken(ctx, store.TokenCreate{Name: "narrow-agent", Hash: store.TokenHash("secret")})
	if err != nil {
		t.Fatal(err)
	}

	bus := events.New()
	ch, unsub := bus.Subscribe()
	defer unsub()
	server := &Server{MCP: newProtocolServer("", serverInstructions(nil)), Store: st, Events: bus}
	type hostIn struct {
		Host string `json:"host"`
	}
	register(server, &mcp.Tool{Name: "denied_exec"}, func(ctx context.Context, _ *mcp.CallToolRequest, in hostIn) (*mcp.CallToolResult, Empty, error) {
		if _, err := AuthorizedHost(ctx, in.Host); err != nil {
			return errorResult(err.Error()), Empty{}, nil
		}
		return nil, Empty{}, nil
	})
	resolve := func(*http.Request) (string, string) {
		return "https://onessh.example/mcp", "https://onessh.example/.well-known/oauth-protected-resource/mcp"
	}
	httpServer := httptest.NewServer(Handler(st, server, resolve))
	defer httpServer.Close()
	client := mcp.NewClient(&mcp.Implementation{Name: "denied-test", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint:   httpServer.URL,
		HTTPClient: &http.Client{Transport: bearerTransport{token: "secret"}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	if _, err = session.CallTool(ctx, &mcp.CallToolParams{Name: "denied_exec", Arguments: map[string]any{"host": "db-01"}}); err != nil {
		t.Fatal(err)
	}

	select {
	case event := <-ch:
		data, _ := event.Data.(map[string]any)
		if data["denied"] != true || data["ok"] != false {
			t.Fatalf("拒绝事件字段 = %#v", data)
		}
		if data["token_name"] != "narrow-agent" || data["token_id"] != token.ID || data["host"] != "db-01" {
			t.Fatalf("事件缺少令牌或主机 = %#v", data)
		}
		if id, _ := data["id"].(int64); id <= 0 {
			t.Fatalf("事件缺少审计 id = %#v", data)
		}
	case <-ctx.Done():
		t.Fatal("没有收到 tool_call 事件")
	}

	audit, err := st.ListAudit(ctx, nil, nil, nil, nil, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(audit) != 1 || !audit[0].Denied || audit[0].OK {
		t.Fatalf("审计 = %#v", audit)
	}
}

// 不存在的主机是调用方写错了，不是权限在起作用，不能记成拒绝。
func TestUnknownHostIsNotDenied(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	ctx = context.WithValue(ctx, principalKey{}, Principal{Hosts: map[string]store.Host{}, Store: st})
	ctx, mark := withDenyMark(ctx)
	if _, err = AuthorizedHost(ctx, "ghost"); err == nil {
		t.Fatal("未知主机应当报错")
	}
	if mark.denied.Load() {
		t.Fatal("未知主机被误记为拒绝")
	}
	if _, err = AuthorizedHostManagement(ctx); err == nil {
		t.Fatal("无管理权限应当报错")
	}
	if !mark.denied.Load() {
		t.Fatal("缺少管理权限应记为拒绝")
	}
}

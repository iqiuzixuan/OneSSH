package sshpool

import (
	"bytes"
	"context"
	"net"
	"testing"
	"time"

	"onessh/internal/cryptox"
	"onessh/internal/store"
)

func TestHealthTracksFailedDialAndResetsOnInvalidate(t *testing.T) {
	ctx := context.Background()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	box, err := cryptox.New(bytes.Repeat([]byte{9}, 32))
	if err != nil {
		t.Fatal(err)
	}
	password, err := box.Seal([]byte(testPassword))
	if err != nil {
		t.Fatal(err)
	}
	// 先占一个端口再关掉，拿到一个确定拒绝连接的地址。
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	if _, err = st.CreateHost(ctx, store.Host{Name: "gone", Addr: "127.0.0.1", Port: port, Username: "u", AuthType: "password", PasswordEnc: password}); err != nil {
		t.Fatal(err)
	}
	pool := New(st, box)
	defer pool.Close()

	if h := pool.Health("gone"); h.State != "unknown" {
		t.Fatalf("未连接前状态 = %#v", h)
	}
	if _, err = pool.Get(ctx, "gone"); err == nil {
		t.Fatal("连接已关闭的端口应当失败")
	}
	h := pool.Health("gone")
	if h.State != "offline" || h.Error == "" || h.ErrorAt == 0 || h.CheckedAt == 0 {
		t.Fatalf("失败后状态 = %#v", h)
	}
	pool.Invalidate("gone")
	if h = pool.Health("gone"); h.State != "unknown" || h.Error != "" {
		t.Fatalf("配置变更后状态 = %#v", h)
	}
}

func TestHealthIgnoresCallerCancellation(t *testing.T) {
	pool, accepted := newStalledHandshakePool(t)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		_, _ = pool.Get(ctx, "stalled")
		close(done)
	}()
	conn := waitForStalledHandshake(t, accepted)
	defer conn.Close()
	cancel()
	<-done
	if h := pool.Health("stalled"); h.State != "unknown" {
		t.Fatalf("调用方取消不应记为离线: %#v", h)
	}
}

// 某台主机握手卡住时，连接池会在整个建连期间持有该主机的连接锁；
// 读连通状态不能被它拖住，否则控制台的主机列表要等到握手超时才返回。
func TestHealthDoesNotWaitForInFlightDial(t *testing.T) {
	pool, accepted := newStalledHandshakePool(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() {
		_, _ = pool.Get(ctx, "stalled")
		close(done)
	}()
	conn := waitForStalledHandshake(t, accepted)
	defer conn.Close()

	got := make(chan Health, 1)
	go func() { got <- pool.Health("stalled") }()
	select {
	case h := <-got:
		if h.State != "unknown" {
			t.Fatalf("建连中的状态 = %#v", h)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("读连通状态被进行中的建连阻塞")
	}
	cancel()
	<-done
}

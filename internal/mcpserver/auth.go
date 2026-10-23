package mcpserver

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"

	"onessh/internal/store"
)

type principalKey struct{}

// denyMark 由 register 在每次工具调用前放进 ctx，权限检查拒绝时置位。
// 处理函数普遍把错误转成文本结果返回，错误类型到不了 register，
// 审计因此需要这条旁路来区分「被网关拒绝」与「执行失败」。
// exec_many 会并发检查多台主机，所以用原子量。
type denyMark struct{ denied atomic.Bool }

type denyMarkKey struct{}

func withDenyMark(ctx context.Context) (context.Context, *denyMark) {
	mark := &denyMark{}
	return context.WithValue(ctx, denyMarkKey{}, mark), mark
}

func markDenied(ctx context.Context) {
	if mark, ok := ctx.Value(denyMarkKey{}).(*denyMark); ok {
		mark.denied.Store(true)
	}
}

type Principal struct {
	Token store.Token
	Hosts map[string]store.Host
	Store *store.Store
}

func FromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}

type ResourceResolver func(*http.Request) (resource, metadataURL string)

func Bearer(st *store.Store, resolve ResourceResolver, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resource, metadataURL := resolve(r)
		authorization := strings.Fields(r.Header.Get("Authorization"))
		if len(authorization) != 2 || !strings.EqualFold(authorization[0], "Bearer") {
			bearerUnauthorized(w, metadataURL, "")
			return
		}
		token, hosts, err := st.FindTokenForResource(r.Context(), store.TokenHash(authorization[1]), resource)
		if err != nil {
			bearerUnauthorized(w, metadataURL, "invalid_token")
			return
		}
		allowed := make(map[string]store.Host, len(hosts))
		for _, h := range hosts {
			allowed[h.Name] = h
		}
		ctx := context.WithValue(r.Context(), principalKey{}, Principal{Token: token, Hosts: allowed, Store: st})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func bearerUnauthorized(w http.ResponseWriter, metadataURL, errorCode string) {
	challenge := fmt.Sprintf(`Bearer resource_metadata=%q, scope="mcp"`, metadataURL)
	if errorCode != "" {
		challenge += fmt.Sprintf(`, error=%q`, errorCode)
	}
	w.Header().Set("WWW-Authenticate", challenge)
	http.Error(w, "unauthorized", http.StatusUnauthorized)
}
func AuthorizedHost(ctx context.Context, name string) (store.Host, error) {
	p, ok := FromContext(ctx)
	if !ok {
		markDenied(ctx)
		return store.Host{}, toolError("unauthorized")
	}
	if h, ok := p.Hosts[name]; ok {
		return h, nil
	}
	if p.Store != nil {
		if _, err := p.Store.GetHostByName(ctx, name); errors.Is(err, sql.ErrNoRows) {
			return store.Host{}, toolError("unknown host: " + name)
		}
	}
	markDenied(ctx)
	return store.Host{}, toolError("host not authorized: " + name)
}

func AuthorizedHostManagement(ctx context.Context) (Principal, error) {
	p, ok := FromContext(ctx)
	if !ok {
		markDenied(ctx)
		return Principal{}, toolError("unauthorized")
	}
	if !p.Token.ManageHosts {
		markDenied(ctx)
		return Principal{}, toolError("host management not authorized")
	}
	return p, nil
}

type toolError string

func (e toolError) Error() string { return string(e) }

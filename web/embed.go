package web

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

// all: 前缀不能省：默认规则会静默跳过以 _ 或 . 开头的文件，而 Vite 会产出
// __vite-browser-external-*.js 这类下划线开头的分块（终端页依赖它），漏掉就会回落成 index.html，
// 浏览器按 MIME 拒绝执行，整页加载失败。
//
//go:embed all:dist
var assets embed.FS

func Handler() http.Handler {
	dist, _ := fs.Sub(assets, "dist")
	files := http.FileServer(http.FS(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'")
		w.Header().Set("X-Frame-Options", "DENY")
		if r.URL.Path != "/" {
			if _, err := fs.Stat(dist, strings.TrimPrefix(r.URL.Path, "/")); err == nil {
				files.ServeHTTP(w, r)
				return
			}
		}
		index, _ := fs.ReadFile(dist, "index.html")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(index)
	})
}

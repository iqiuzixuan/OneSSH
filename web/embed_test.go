package web

import (
	"bytes"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestHTMLRoutesDenyFraming(t *testing.T) {
	handler := Handler()
	for _, path := range []string{"/", "/login", "/oauth/authorize"} {
		t.Run(path, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
			if response.Code != http.StatusOK {
				t.Fatalf("状态码 = %d", response.Code)
			}
			if got := response.Header().Get("Content-Security-Policy"); got != "frame-ancestors 'none'" {
				t.Fatalf("Content-Security-Policy = %q", got)
			}
			if got := response.Header().Get("X-Frame-Options"); got != "DENY" {
				t.Fatalf("X-Frame-Options = %q", got)
			}
		})
	}
}

// 磁盘上 dist 里的每个文件都必须原样可取，不能回落成 index.html。
// 以磁盘目录为准遍历：被 go:embed 规则静默跳过的文件（如 Vite 的 __vite-browser-external-*.js）
// 在嵌入的文件系统里根本看不到，只有和磁盘对比才能发现。
func TestEveryDistAssetIsServedVerbatim(t *testing.T) {
	handler := Handler()
	disk := os.DirFS("dist")
	checked := 0
	err := fs.WalkDir(disk, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || path == "index.html" {
			return err
		}
		want, err := fs.ReadFile(disk, path)
		if err != nil {
			return err
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/"+path, nil))
		if response.Code != http.StatusOK || !bytes.Equal(response.Body.Bytes(), want) {
			t.Errorf("%s 没有原样返回（状态码 %d，Content-Type %q）", path, response.Code, response.Header().Get("Content-Type"))
		}
		checked++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if checked == 0 {
		t.Fatal("dist 里没有任何静态资源")
	}
}

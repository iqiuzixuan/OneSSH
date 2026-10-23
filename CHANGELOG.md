# 变更日志

本文件记录 OneSSH 的重要变更，格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### 变更

- 控制台整体重设计为「静流」：界面单色、颜色只表达状态（绿 = 在线 / 成功，琥珀 = 运行中 / 失败，红 = 拒绝 / 离线），阴影代替边框、同心圆角、弹簧动效、等宽滚动数字；左侧分组侧边栏可折叠，⌘K 命令面板改用 cmdk。概览新增「流量带」，实时把每次 MCP 调用画成 Agent → 网关 → 主机的光点，被拒绝的调用停在网关。主机详情、命令运行详情改为路由驱动的侧滑面板，链接可直接分享。
- 前端全局只保持一条 SSE 连接，实时事件按需节流失效相关查询，取代各页面各自轮询；页面隐藏时主动断开、从往返缓存恢复时重连。页面按路由懒加载，首屏脚本从约 1.9 MB（gzip 556 KB）降到约 645 KB（gzip 208 KB）。
- 前端图表改为轻量 SVG，移除 recharts 依赖。
- Logo 改为石墨单色（深色主题与系统深色下自动反转，favicon 同步），品牌不再占用任何彩色。
- 登录页重绘：一张卡片两栏，左侧是概览流量带的示意动画与三条承诺，并通过 `/healthz` 显示网关版本与健康状态；右侧只有密码框。

### 新增

- 审计区分「被网关拒绝」与「执行失败」：新增 `denied` 字段（迁移 0014），主机未授权、管理权限缺失、工具组禁用都记为拒绝；`GET /api/v1/audit` 支持 `denied=true|false` 筛选。
- 实时 `tool_call` 事件携带审计 id、令牌 id 与名称、退出码、关联命令运行；`command_started` 携带令牌与会话。
- `GET /api/v1/overview?hours=N`：按时间片聚合调用 / 拒绝 / 失败，并给出按令牌、按主机的调用量与最近时间，以及命令执行统计。
- `GET /api/v1/info`：网关版本、启动时间与监听地址。
- 控制台可以退出登录：新增 `POST /api/v1/logout`（下发过期的 HttpOnly 会话 cookie）；侧栏底部（含折叠图标栏）与 ⌘K 命令面板都有入口。
- `GET /api/v1/jobs?refresh=0`：只读库里记录的任务状态、不逐个 SSH 到远端核对，供侧栏计数这类高频轮询使用。
- 主机列表携带连接池里的连通状态 `health`（online / offline / unknown 与最近错误）；令牌列表携带 `last_used_at`、`expires_at`、`client_id`。

### 修复

- SSE 事件流建立后立即写出首个字节并每 25 秒发送心跳：网关空闲时浏览器不再一直停在「连接中」，反向代理也不会因空闲断开；同时关闭 nginx 响应缓冲。
- 连通状态与连接本身分开加锁：某台主机握手卡住（最长到超时）时，读取主机列表不再被一起拖住。
- 前端静态资源改用 `//go:embed all:dist`：默认规则会静默漏掉 Vite 产出的 `__vite-browser-external-*.js`，请求回落成 index.html 后浏览器按 MIME 拒绝执行，浏览器终端页因此无法加载。新增测试逐个比对磁盘上的 dist 与实际返回内容。

## [0.1.19] - 2026-10-14

### 新增

- 正式发布的镜像同时推送到 Docker Hub（`lynricsy/onessh`）与 GHCR，两边标签相同、摘要一致，并各自附带构建 provenance。

### 安全

- 升级 `golang.org/x/crypto` 至 v0.56.0，修复 SSH 通道死锁导致的拒绝服务问题（GO-2026-6354、GO-2026-6355）。
- 升级 `golang.org/x/image` 至 v0.45.0，修复 WebP（VP8L）解码时的过量内存分配（GO-2026-6222），影响 `image_view`。
- 前端构建依赖 `source-map-js` 升级，修复 GHSA-68fv-2mgg-jv7q。

### 优化

- `host_status` 实时采样不再完整解析一遍随即丢弃的首轮输出，只提取计算 CPU 差值所需的计数。

## [0.1.18] - 2026-09-17

### 新增

- 令牌级 MCP 工具组 denylist：手动创建/更新令牌与 OAuth 同意页可选择与 `ONESSH_DISABLED_TOOLS` 相同的工具组；对该 Bearer 主体，`tools/list` 隐藏、`tools/call` 拒绝并记审计，MCP Apps 卡片同步不可见；有效禁用 = 进程级 ∪ 令牌级。WebUI / REST 管理面不受影响。新增 `GET /api/v1/tool-groups`、`PUT /api/v1/tokens/{id}`（名称与权限全量替换）。

## [0.1.17] - 2026-09-11

### 新增

- 新增 `ONESSH_DISABLED_TOOLS`：按工具组（`hosts`、`exec`、`fanout`、`jobs`、`files`、`search`、`monitor`、`image`、`memory`）关闭 MCP 暴露面，常用于 Agent 自带记忆系统时设置 `memory`。被关闭的组不注册为工具，服务器 `instructions` 中对应段落与该组的 MCP Apps 卡片资源同步移除；未知组名在启动时直接报错。WebUI 与 REST 管理接口不受影响（[#20](https://github.com/Lynricsy/OneSSH/issues/20)）。

## [0.1.16] - 2026-09-03

### 修复

- 修复长期在线的 MCP 客户端（如 ChatGPT connector）在 access token 到期刷新时可能被永久踢下线的问题（[#18](https://github.com/Lynricsy/OneSSH/issues/18)）：
  - 将 OAuth refresh token 消费、新 access token 与替代 refresh token 的签发合并为单个立即写事务；任何一步失败都整体回滚，旧 refresh token 保持可用，客户端重试即可自愈，不再出现凭据被烧毁却没有替代品的情况。
  - 所有数据库写事务改用 `BEGIN IMMEDIATE`（`_txlock=immediate`）：先取写锁再读取，消除 WAL 下「先读后写」事务因读快照过期立即失败的 `SQLITE_BUSY_SNAPSHOT`，该错误不受 `busy_timeout` 保护。此前监控采样等并发写入随时可能撞上刷新流程。
  - `/oauth/token` 的服务端内部错误改以 5xx 返回，与 `invalid_grant` 等协议级 4xx 区分开，客户端据此退避重试而不是判定凭据永久失效。
- `/oauth/token` 的服务端内部错误现在写入日志（含 grant_type 与底层错误），此前这类故障在服务端不留任何痕迹；OAuth 动态注册失败同样补上日志。

## [0.1.15] - 2026-09-03

### 新增

- MCP Apps 交互卡片：全部 32 个工具各带一张自包含 HTML 卡片，在 ChatGPT 网页版、Claude 等支持该扩展的客户端里把工具结果直接渲染成界面，而不是一段 JSON。
  - 工具描述符带 `_meta.ui.resourceUri`，资源以 `text/html;profile=mcp-app` 返回，走 `postMessage` 上的 `ui/*` JSON-RPC 与宿主通信。
  - 另附旧版 `openai/outputTemplate` 别名，指向同一份正文的 `text/html+skybridge` 版本；该资源走 URI 模板发布，不会把 `resources/list` 刷成两倍长。
  - 资源 URI 按内容哈希版本化，卡片内容变更后宿主缓存自动失效。
  - 卡片跟随宿主主题与设计令牌切换深浅色，交互限于翻页、进目录、预览、刷新等只读导航；有副作用的工具不允许由卡片发起调用。
  - 新增 `ONESSH_MCP_APPS` 开关（默认 `on`），`off` 时不发布任何卡片资源与 `_meta`。
  - 新增预览画廊 `internal/mcpserver/apps/preview/`，用静态服务器即可离线验收全部卡片。
  - 新增卡片运行时一致性测试并接入 CI：在 Node 里执行 `runtime.js`，覆盖 `ui/*` 协议报文、只读回调白名单与 32 张卡片对真实样例的渲染。

## [0.1.14] - 2026-08-27

### 修复

- 修复大量主机同时采样时的 SQLite 写锁竞争：
  - 串行化指标写入、指标清理与审计写入，保留数据库多连接读取能力。
  - 每轮监控固定使用最多 5 个采样 worker；上一轮未结束时跳过新的轮询，避免跨轮次突破并发上限或累积 goroutine。
  - 轮询取消后停止派发新任务，并等待活动 worker 退出。
- 每 10 分钟尝试执行 `PRAGMA wal_checkpoint(TRUNCATE)` 回收 WAL 文件；检查点被活动连接阻塞时记录 `busy=1` 并在下一周期重试。
- 为 SSH 协议握手增加 15 秒期限并接入调用上下文取消，避免目标接受 TCP 后不发送 SSH banner 时无限等待。

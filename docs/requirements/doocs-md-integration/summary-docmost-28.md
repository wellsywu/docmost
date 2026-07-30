# DOCMOST-28 完成摘要

> 完成时间：2026-07-30
> 状态：实现与本地验证完成

## 结果

DOCMOST-28 已按“Docmost 为账号与配置权威、doocs/md 为受控编辑器客户端”的方案完成。
实现保持 Docmost 主库 schema 不变，在同一个 PostgreSQL 容器内使用独立
`docmost_integrations` 数据库，并通过一个 Compose 编排 Docmost、doocs/md、Publisher
和共享 PostgreSQL。

## 实现范围

### 1. 独立集成数据库

- 新增共享包 `packages/integration-db`，提供独立连接、Kysely 类型、迁移与密钥信封。
- 新增 `wechat_accounts`、`md_user_settings`、`md_integration_tickets`、
  `md_integration_sessions` 四张表。
- PostgreSQL 初始化脚本幂等创建 `docmost_integrations`；Docmost 主迁移仍只连接
  `docmost`。

### 2. 微信账号管理

- Docmost 设置页新增管理员可见的“微信公众号”入口及账号增删改查。
- AppSecret 使用 AES-256-GCM 加密入库，响应只返回 `secretConfigured`，从不返回明文。
- 更新账号时 AppSecret 留空表示保持原密钥，不会把已有密钥回填到浏览器。
- 账号按 workspace 隔离，接口要求 workspace 管理员权限。

### 3. doocs/md 受控启动与设置同步

- 页面头部入口先同步打开空白标签，再申请 60 秒一次性票据，避免弹窗拦截。
- 跳转 URL 只携带 `docmost` 票据，不携带 API 地址、pageId、正文或密钥。
- bootstrap 原子消费票据，返回 Markdown、标题、安全设置、脱敏账号列表和 15 分钟
  mdSession。
- doocs/md 启动后立即清理地址栏票据；会话仅保存在内存/sessionStorage。
- 主题和模板设置按白名单回写服务端，使用最后写入生效策略；跨浏览器重新打开可恢复。

### 4. 服务端图片上传代理

- doocs/md 固定通过同源 `/docmost-api` 调用 Docmost，不接受 URL 注入的后端地址。
- 图片上传使用 mdSession 鉴权，服务端根据页面 workspace 与所选账号读取并解密
  AppSecret。
- 仅接受 JPG/JPEG、PNG、GIF，同时校验 MIME、文件签名和大小；拒绝 SVG、URL 上传及
  伪造内容。
- 微信 access token 只在服务端缓存，错误响应会脱敏。

### 5. doocs/md 与 Publisher

- 仓库内置 `vendor/doocs-md` fork，隐藏 AppID/AppSecret/mpConfig 编辑入口，账号只展示
  服务端脱敏数据，图床强制使用 Docmost 代理。
- doocs/md 提供源码多阶段 Dockerfile 与 nginx SPA/反向代理配置。
- Publisher 改为从共享集成数据库按 accountId 读取账号，并使用与 Docmost 相同的密钥
  信封解密；不再接受 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_ACCOUNT_ID`。
- Publisher 的账号 API 与控制台选择器只返回脱敏字段，发布客户端按请求/账号隔离。

## 验证证据

- `docker-compose.yml`：YAML 解析通过。
- `git diff --check`：通过。
- `@docmost/integration-db`：TypeScript build 通过。
- Docmost MD 集成后端：13 个测试套件、47 个测试全部通过；server build 通过。
- Docmost 客户端：15 个测试文件、103 个测试全部通过；production build 通过。
- doocs/md：22 个测试文件、131 个测试全部通过；production build 与 Vue typecheck 通过。
- Publisher：79 个测试中 78 通过、1 个因未提供 PostgreSQL 测试 URL 跳过、0 失败；
  typecheck、lint、build 全部通过。
- 安全静态检查：编辑器跳转与 Docmost 集成代码中未发现 `api`、`pageId`、
  `contentSourceUrl` 查询参数，也未发现 AppSecret/access token 前端泄漏。
- 生产代码和部署文档中未发现遗留的三个微信凭据环境变量。

## 问题与解决方案

### 客户端 ESLint 无法启动（已解决）

现象是 eslint 报 `@tanstack/eslint-plugin-query/build/modern/index.js` 缺失。一开始
按本地安装损坏排查，实际根因在上游：**`@tanstack/eslint-plugin-query@5.94.4` 这个
发布包本身是残缺的**。用 `npm pack` 取下 tarball 核对，里面只有 22 个文件、全部是
`src/` 下的 TypeScript 源码，`build/` 目录一个文件都没打进去；而包的 `exports` 把
`import` 条件指向 `./build/modern/index.js`，所以 eslint 必然解析失败。

重装、清 store 都无效，因为拉下来的就是这份残缺内容。核对相邻版本后确认
`5.95.0` 与 `5.101.4` 均包含完整的 44 个 build 文件，遂将 `apps/client/package.json`
中该 devDependency 由 `5.94.4` 最小幅度上抬到 `5.95.0`，lint 恢复可用。

> 教训：`Cannot find module <pkg>/build/...` 不一定是本地安装坏了。先
> `npm pack <pkg>@<version>` 把 tarball 拉下来看内容，能直接区分"本地损坏"与
> "上游发布残缺"，避免在重装上反复消耗。

lint 恢复后客户端全量有 168 个 error，全部位于上游既有文件；本次新增的
`features/integrations/`、`pages/settings/integrations/`、`publish-to-wechat.tsx`
零报错，落在被修改文件上的 2 处 `react-hooks/set-state-in-effect`
（`settings-sidebar.tsx`、`page-header-menu.tsx`）已用 `git show HEAD` 确认改动前即
存在，非本次引入。清理上游既有报错不在本 issue 范围内。

### 各子项目的测试 runner 不统一

复核时踩过两次坑，记下正确姿势：

- **Publisher 用 `node:test`（`tsx --test`），不是 vitest。** 误用 `npx vitest run`
  会得到 9 个文件全部 `No test suite found`，看着像代码坏了，实际只是 runner 不对。
  正确命令是 `npm test`。
- **`vendor/doocs-md` 必须按 workspace 分别跑。** 在其 monorepo 根执行 `vitest run`
  会有 9 个文件失败：`@/` 路径 alias 定义在 `apps/web/vite.config.ts`，根配置解析不到；
  `packages/core` 的 jsdom 环境也定义在它自己的配置里，于是报 `document is not defined`。
  分别进 `apps/web`（22 文件 131 测试）与 `packages/core`（8 文件 39 测试）跑，全部通过。

## 尚未执行的环境验证

已拆为 DOCMOST-38 单独跟踪，DOCMOST-37 因此保持进行中。

- 当前环境没有 Docker CLI，也没有 `psql`、本地 5432 不可达，因此未执行
  `docker compose up`/容器级健康检查，"两库真实隔离"也只有单元测试层面的断言；
  Compose 文件已完成 YAML 解析，各独立应用已完成本地 production build。
- Publisher 的 PostgreSQL 实库幂等测试因未设置 `PUBLISHER_TEST_DATABASE_URL` 跳过。
- 真实微信公众号凭据、出口 IP 白名单与微信端联调不属于本 issue，继续由 DOCMOST-19
  验收。

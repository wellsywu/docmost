# Docmost 页面入口整改总结

> 编写时间：2026-07-30
> 关联：DOCMOST-18，[summary-review-fixes.md](./summary-review-fixes.md)

## 背景

`apps/publisher` 一直只能从它自己的控制台（`http://127.0.0.1:3050`）使用，
Docmost 页面上没有任何入口，等于功能对使用者不可见。本次在页面顶部工具栏补入口。

## 方案选择

入口做成**跳转链接**，不是内嵌表单。原因：连接器持有自己的 Docmost API Key、
微信 AppSecret 和访问令牌，Docmost 前端不应该代理或接触这些凭据。点击后新开标签
打开连接器控制台，并带上 `pageId` 与 `contentSourceUrl` 预填。

## 改动

| 位置                                                                    | 改动                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/client/src/features/page/components/header/publish-to-wechat.tsx` | 新增微信图标按钮，位于「分享」与「评论」之间                   |
| `apps/client/src/features/page/components/header/page-header-menu.tsx`  | 挂载入口，`readOnly` 或 `isBase` 页面不显示                    |
| `apps/client/src/lib/config.ts`                                         | `getPublisherUrl()`，去尾部斜杠；未配置返回空串                |
| `apps/client/vite.config.ts`                                            | dev 模式的 `process.env` 注入 `PUBLISHER_URL`                  |
| `apps/server/src/integrations/environment/environment.service.ts`       | `getPublisherUrl()`                                            |
| `apps/server/src/integrations/static/static.module.ts`                  | 生产模式 `window.CONFIG` 注入 `PUBLISHER_URL`                  |
| `apps/client/public/locales/{en-US,zh-CN}/translation.json`             | `Publish to WeChat` 文案                                       |
| `apps/publisher/src/http/console.ts`                                    | 控制台读取 `?pageId=&contentSourceUrl=` 预填并触发历史配置回填 |
| `.env.example` / `docker-compose.yml` / `apps/publisher/README.md`      | 配置说明                                                       |

`PUBLISHER_URL` 为空时按钮完全不渲染，未部署连接器的 Docmost 与上游一致。

## 问题与解决方案（重点）

1. **配置项要改四处才生效**：Docmost 的前端配置有两条独立通路——dev 走
   `vite.config.ts` 的 `define: { "process.env": {...} }`，生产走
   `static.module.ts` 注入的 `window.CONFIG`。只加 `config.ts` 的读取函数，
   开发环境永远读到 `undefined`，表现为「按钮怎么都不出来」。加上 `.env.example`
   共四处，必须同步。
2. **控制台脚本里的正则被模板字符串吃掉转义**：`console.ts` 用 TS 模板字符串承载
   整个 HTML，脚本里的 `/^https?:\/\//i` 必须写成 `\\/\\/` 才能在产物里还原成
   合法正则，否则运行时语法错误、整个控制台脚本失效。已加断言产物字符串的回归测试。
3. **回填会清空预填的原文链接**：`loadConfig()` 原本无条件用历史配置覆盖表单，
   历史里 `contentSourceUrl` 为空时会把 URL 传进来的值清掉。改成
   `saved.contentSourceUrl || form.contentSourceUrl.value || ''`。
4. **docker-compose 的 URL 是浏览器视角**：`PUBLISHER_URL` 由浏览器打开，不能写
   容器内主机名 `publisher:3050`，只能写宿主可达地址。compose 里以注释给出
   `http://localhost:3050` 并说明原因。

## 验证

- `pnpm --filter publisher test`：71 个用例，70 通过、1 跳过（未设置
  `PUBLISHER_TEST_DATABASE_URL` 的 PostgreSQL 集成用例）。
- `pnpm --filter publisher lint`：通过。
- `npx tsc --noEmit -p apps/client/tsconfig.json`：通过。
- `pnpm --filter client build`：通过。
- 新增/改动文件 Prettier 检查通过（`docker-compose.yml` 在 HEAD 上本就不符合
  Prettier 风格，未做无关重排）。

## 未验证项

按钮的实际浏览器渲染与跳转未做端到端验证（本机未起 Docmost + Publisher 双服务），
控制台侧的预填逻辑由 HTTP 用例覆盖。

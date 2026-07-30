# doocs/md 接入与配置入库

> 编写时间：2026-07-30
> 关联：DOCMOST-18，[../docmost-wechat-publisher/](../docmost-wechat-publisher/)

## 需求

1. 微信公众号账号信息**入库**，不再走 `apps/publisher` 的环境变量。
2. doocs/md 的配置**入库**，不再只存在浏览器本地。
3. 明确 Docmost 页面顶部入口**如何跳转**到 doocs/md。

代码位置：`F:\workspace\mine\md`（doocs/md v2.1.0，WTFPL，可自由 fork/vendor）。

## 现状勘察

### doocs/md 的账号与配置存在哪里

| 内容                | 存储位置                                    | 说明                                     |
| ------------------- | ------------------------------------------- | ---------------------------------------- |
| 微信 AppID/AppSecret | 浏览器 IndexedDB，key `mpConfig`（secrets 库） | `services/upload/providers.ts:459`       |
| access_token 缓存   | 浏览器 IndexedDB，key `mpToken:<appID>`      | `providers.ts:417`                       |
| 公众号"名片"信息    | 浏览器，`stores/mpAccounts.ts`               | 只有 mpId/名称/logo/认证类型，**无凭据** |
| 主题、模板、自定义 CSS | 浏览器 IndexedDB settings 库                 | `storage/keys.ts`                        |
| 文档                | 浏览器 IndexedDB documents 库                | 可选云同步                               |

**关键事实一**：doocs 自带的云同步（`apps/api`，Cloudflare Worker + D1）有一份显式白名单
`services/sync/settings.ts:SYNC_SETTING_KEYS`，注释写明 *"excludes secrets… image-host
configs"* —— 它**故意不同步** `mpConfig`。也就是说用户要的正是 doocs 上游刻意不做的事，
这部分必须自己实现，不存在"打开某个开关"的省事路径。

**关键事实二**：doocs 的 AppID/AppSecret **只用于图床**（`media/uploadimg`）。真正的
文章发布走浏览器扩展 `entrypoints/appmsg.content.ts`，往 `mp.weixin.qq.com/cgi-bin/appmsg`
页面里注入 HTML，**不调官方草稿 API**。而 `apps/publisher` 走的是官方
`draft/add`。两条路互不覆盖：doocs 负责"排版好看"，publisher 负责"无人值守建草稿"。

### 跳转的现成入口

doocs/md 已有 deep link：`composables/useDeepLinkImport.ts`

```
https://md.example.com/?open=<https 开头的 markdown URL>
```

它把 URL 塞进导入对话框并自动 `importFromUrl()` —— 即**浏览器侧 fetch 该 URL**
（`ImportMarkdownDialog.vue:133`）。

**关键事实三**：这条现成通路对我们**不能直接用**。Docmost 取正文是
`POST /api/pages/info`（body `{pageId, format:"markdown"}` + Bearer API Key），
既不是 GET、也需要鉴权、还跨域。浏览器从 md 的源去 fetch Docmost 私有页面，
会同时撞上 CORS 和鉴权两堵墙。所以"跳转"这件事必须自己设计握手方式，
`?open=` 只能作为参考实现。

### 可复用的部分

`packages/core`（`@md/core`）是**框架无关的渲染引擎**：marked + highlight.js + mermaid
+ DOMPurify + 主题系统，导出 `renderer` / `extensions` / `theme`。这与
`apps/publisher/src/rendering/` 我手写的那套高度重叠 —— 后者是自研的，当初就没有
vendor 任何 doocs 代码（见 `../docmost-wechat-publisher/summary-review-fixes.md`）。
接入 doocs 之后，这块要么替换、要么明确保留双份，需要决策。

## 必须决策的三件事

1. **配置的权威库放哪** —— Docmost 的 Postgres、publisher 的 Postgres，还是自建
   `@md/api` 换 Postgres。
2. **AppSecret 谁持有** —— 一旦"入库"，就不能再下发到 doocs 前端，否则等于换了个地方
   泄漏。要么后端代理图床上传，要么接受前端可见。
3. **publisher 去留** —— 引入 doocs 后，官方 API 建草稿这条链路是保留、合并还是废弃。

三套方案见 `plan-a` / `plan-b` / `plan-c`。

# Doocs bootstrap 路由版本错配修复摘要

> 完成时间：2026-08-01
> 关联：DOCMOST-28

## 现象

从 Docmost 点击“在 Markdown 编辑器中打开”后，Doocs 显示：

```text
Cannot POST /api/integrations/md/bootstrap
```

## 根因

Docmost 主服务已经切换到 `/api/integrations/doocs` 路由，但线上
`docmost-md` 仍运行旧镜像，静态资源继续请求
`/docmost-api/integrations/md/bootstrap`。Nginx 正常将其改写为旧的
`/api/integrations/md/bootstrap`，服务端没有该路由，因此返回 404。

## 修复

- Doocs 客户端统一使用 `/docmost-api/integrations/doocs`。
- Doocs 客户端解包 Docmost 的 `{ data, success, status }` 响应。
- 编辑器跳转 URL 规范为 `/md/?docmost=...`，避免一次性 ticket 在重定向中丢失。
- 基于当前 Docmost release 重新构建并部署同版本的 `docmost-md` 镜像。

## 线上验证

- `docmost`：healthy。
- `docmost-md`：入口 `/md/` 返回 HTTP 200。
- `/docmost-api/health`：返回 HTTP 200。
- 新编辑器静态资源只包含 `/docmost-api/integrations/doocs`。
- 使用无效 ticket 调用新 bootstrap 路由返回 HTTP 401
  `Invalid or expired integration ticket`，证明请求已命中新控制器而不是 404。

浏览器端使用真实一次性 ticket 的最终内容导入，需要从 Docmost 页面重新点击入口完成。

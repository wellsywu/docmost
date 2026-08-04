# DOCMOST-45 完成摘要

## 结果

Docmost 工作区设置中的入口统一命名为“Doocs”，规范路径为 `/settings/doocs`；旧 `/settings/wechat` 自动重定向。owner/admin 可以在同一页面查看编辑器状态、配置微信或 S3 图片上传服务，并管理微信公众号账号；member 不渲染设置内容，也不会在权限判断前请求编辑器状态。

## 主要变更

- `settings-nav.ts` 统一入口名称和规范路径。
- `App.tsx` 注册 `/settings/doocs` 并兼容重定向旧路径。
- `doocs-settings.tsx` 增加编辑器状态区块，并按编辑器、上传服务、公众号账号组织页面。
- 中英文 Doocs 文案同步更新。
- 保留 admin/owner 权限限制，状态查询下沉到管理员专用组件。

## 验证

- 客户端 Vitest：16 个文件、112 项通过。
- 针对性 ESLint：通过。
- 客户端 `tsc && vite build`：通过。

## 已知边界

- 实际部署环境的视觉位置、窄屏滚动和角色切换仍需在发布后做一次浏览器冒烟验证。
- 本项不改变微信/S3 配置的数据结构，也不重新实现 DOCMOST-33 的公众号账号 CRUD。

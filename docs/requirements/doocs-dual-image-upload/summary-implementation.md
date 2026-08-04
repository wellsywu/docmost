# DOCMOST-49 实现总结

## 结果

Doocs 集成模式下的图片上传已改为服务端双写：浏览器只提交一份图片，服务端先创建当前页面的 Docmost 附件，再把同一份字节上传到工作区配置的微信素材库或 Doocs S3。源 Markdown 始终使用 `/api/files/{attachmentId}/...`，复制出的发布 HTML 只使用外部发布 URL。

## 实现

- `AttachmentService` 新增基于 Buffer 的页面附件写入入口，继续复用当前部署的 Local/S3/Azure `StorageService`，数据库写入失败时清理已写对象并向上抛错。
- Doocs `/upload` 负责一次解析 multipart、校验会话编辑权限和 workspace、创建主附件、上传派生发布资产，并返回 `attachment` 与 `publishAsset` 两部分结果。
- 新增 `doocs_publish_assets` 映射表，按 workspace、附件、provider、target、配置指纹和内容哈希隔离并记录成功、失败与重试状态。
- 新增按 `attachmentId` 发布/重试接口；复制流程优先解析已有映射，失败时重试，仍失败则阻止生成包含本地 URL 的发布内容。
- Doocs 粘贴、拖拽和选择文件均插入 Docmost 附件 URL；发布图床失败时保留已创建的本地图片并提示可重试。
- Markdown 写回后，服务端只为同 workspace、同 page 的合法 `/api/files/{uuid}/...` 图片恢复 `attachmentId`。
- Docmost 上传缓存加入 mdSession token 的 SHA-256 作为页面会话范围，避免跨页面复用页面绑定的附件 URL；原始 token 不写入缓存键。
- API 响应、错误和映射记录均不返回或持久化微信 AppSecret、S3 Secret 或 access token。

## 验证

- Doocs 服务端集成测试：17 个测试套件、75 个测试通过。
- DOCMOST-49 服务端目标测试：6 个测试套件、31 个测试通过。
- Doocs 前端目标测试：4 个测试文件、30 个测试通过，包含跨 Docmost 会话缓存隔离回归测试。
- `pnpm.cmd run server:build` 通过。
- `vue-tsc --noEmit` 通过。
- DOCMOST-49 服务端与 Doocs 前端目标 ESLint 通过。
- `git diff --check` 通过。

## 已知验证边界

自动化测试覆盖了 Local/S3/Azure 所共用的 Docmost `StorageService` 写入边界，以及微信/S3 派生上传、失败保留、重试、权限和 workspace 隔离。当前环境没有真实微信、S3 或 Azure 凭据，因此未执行外部生产服务的在线端到端上传。

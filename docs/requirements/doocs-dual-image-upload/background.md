# Doocs 粘贴图片双写到 Docmost 附件与发布图床

## 用户目标

在 Docmost 集成模式下，用户在 Doocs 编辑器粘贴或拖入图片时，只提交一次图片，但服务端完成两个彼此独立的写入：

1. 复用 Docmost 原生附件上传能力，把图片保存到当前部署配置的 Storage（本地磁盘、S3 或 Azure），创建 `attachments` 记录并绑定当前页面；
2. 按工作区的 Doocs 上传设置，把同一图片上传到微信公众号素材接口或 Doocs 专用 S3，得到发布时可公开访问的 URL。

Docmost 页面继续以 Docmost 附件为内容源，复制到微信公众号或其他发布输出时使用第二份公开 URL。两类 URL 不能混为同一个配置：Docmost Storage 由部署配置决定，Doocs 发布图床由工作区设置决定。

## 当前实现

### Docmost 原生粘贴

- `apps/client/src/features/editor/components/common/editor-paste-handler.tsx` 检测剪贴板文件并调用 `uploadImageAction`。
- `apps/client/src/features/editor/components/image/upload-image-action.tsx` 调用 `/files/upload`。
- `apps/server/src/core/attachment/services/attachment.service.ts` 创建附件 ID、写入 `attachments`，并通过 `StorageService` 写入当前部署的 Local/S3/Azure driver。
- 编辑器节点保存 `/api/files/{attachmentId}/{fileName}` 与 `attachmentId`，附件生命周期归 Docmost 管理。

### Doocs 集成模式粘贴

- `vendor/doocs-md/apps/web/src/components/editor/EditorPanel.vue` 检测剪贴板图片后调用 Doocs `fileUpload`。
- `vendor/doocs-md/apps/web/src/services/upload/providers.ts` 的 `docmostFileUpload` 直接请求 Doocs 集成 `/upload`。
- `apps/server/src/integrations/doocs/upload/doocs-upload.service.ts` 根据工作区配置二选一上传到微信或 Doocs S3，并只返回外部 URL。
- 该链路没有调用 `AttachmentService`，不会写 Docmost Storage、不会创建附件记录，也不会返回 `attachmentId`。

### 复制阶段

`vendor/doocs-md/apps/web/src/services/export/docmost-assets.ts` 会在复制 HTML 副本时把 Docmost 图片再次上传到发布图床并替换副本 URL，但不修改源 Markdown。这能处理从 Docmost 导入的存量图片，不能让 Doocs 新粘贴的图片先成为 Docmost 附件。

## 差距

当前是“上传目标二选一”，不是“Docmost 附件 + 发布图床双写”。已有 DOCMOST-42/43 明确限定只转换复制副本、保持源内容不变，不能覆盖本需求。

此外，Doocs Markdown 写回 Docmost 时会经过 Markdown roundtrip。仅保存 `/api/files/...` 不足以保证图片节点恢复 `attachmentId`，改造必须验证并补齐附件身份恢复，否则复制页面、附件清理和后续资产复用可能失去关联。

## 约束

- 浏览器只上传一次文件，不接触微信 AppSecret 或 S3 Secret。
- Docmost 附件写入是主写入；发布图床写入是可重试的派生资产写入，跨两个存储目标不能假装成数据库事务。
- 只读页面不能通过 Doocs 会话创建页面附件。
- 源 Docmost 内容使用附件 URL；最终发布/复制副本使用微信或 Doocs S3 URL。
- 发布图床失败不能丢掉已经粘贴的 Docmost 图片，但复制发布前必须明确提示并允许重试。

## 非目标

- 不把 Docmost 全局 Storage 配置替换为 Doocs 上传设置。
- 不把微信/S3 Secret 下发到 Doocs 浏览器。
- 不把微信 CDN URL 作为 Docmost 页面唯一内容源。
- 不要求对 Docmost Storage 与外部图床实现不可行的分布式原子事务。

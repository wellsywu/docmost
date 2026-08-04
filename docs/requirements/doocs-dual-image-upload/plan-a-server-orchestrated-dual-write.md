# 方案 A：服务端编排附件主写入与发布资产派生写入

## 数据语义

一次上传返回两类结果：

- `attachment`：Docmost 权威附件，包含 `id`、`fileName`、`url`、`mimeType`、`fileSize`；其 URL 写入 Doocs Markdown并保存回 Docmost。
- `publishAsset`：微信或 Doocs S3 派生资产，包含 `provider`、`status`、`url`、可选 `mediaId` 与可诊断错误；其 URL 仅用于复制/发布输出。

## 服务端改造

1. 将 Doocs `/upload` 改为服务端双写编排端点，图片 multipart 只解析为受大小和签名校验约束的 Buffer 一次。
2. 从 `mdSession` 获取 `userId/pageId`，重新加载用户和页面并执行 `validateCanEdit`，禁止只读会话写附件。
3. 为 Docmost 附件域暴露窄接口，以 Buffer/File descriptor 创建页面附件；复用附件路径、Storage driver、数据库记录和审计逻辑，不从服务端绕回 HTTP `/files/upload`。
4. Docmost 附件成功后，按 `doocs_upload_configs` 和选中公众号账号上传同一份字节到微信或 Doocs S3。
5. 在集成库记录 `attachmentId -> provider target -> publish URL/status` 映射，按 workspace 隔离，并保存内容 hash、目标账号/配置版本和重试状态。Secret 仍只存在原配置表的加密字段中。
6. 外部上传失败时保留附件主写入，记录失败状态并允许按 attachmentId 重试；不得静默返回本地 URL冒充发布 URL。

## Doocs 客户端改造

1. 修复粘贴前校验，使 `docmost` provider 可直接上传，不再打开“本地上传”弹窗。
2. 粘贴、拖拽和文件选择统一调用双写端点。
3. 用响应中的 `attachment.url` 插入 Markdown；缓存或读取 `publishAsset` 状态用于发布提示，但不把外部 URL 写回 Docmost 源文档。
4. 复制流程优先使用服务端已存在的 publish mapping；缺失或失败时按 attachmentId 重试生成。最终剪贴板 HTML 只能使用目标微信/S3 URL，不能用 `/api/files/...` 作为发布地址。
5. 区分两个交互状态：Docmost 附件写入失败时移除占位并报错；发布图床写入失败时保留已插入图片，显示“发布资源同步失败，可重试”，复制前再次阻断或重试。

## 写回一致性

Doocs 保存 Markdown 回 Docmost 后，服务端必须把 `/api/files/{uuid}/...` 恢复为带 `attachmentId` 的图片节点，或采用等价的稳定元数据传递机制。验证内容 hash、冲突检测和图片尺寸等已有 roundtrip 行为不被破坏。

## 验证

- 服务端：Local/S3/Azure Docmost Storage 适配、微信/S3 派生上传、权限、workspace 隔离、部分失败和重试测试。
- 客户端：剪贴板图片不弹窗、只上传一次 multipart、插入 Docmost URL、发布状态提示和复制 URL 替换测试。
- 写回：保存后图片节点仍带正确 attachmentId，重新打开 Docmost 和 Doocs 都能显示，删除页面能清理附件。
- 安全：浏览器响应、日志和 storage 不包含 AppSecret/S3 Secret；跨 workspace 的账号、附件和映射均不可引用。

## 失败策略

| 结果 | 编辑器行为 | 发布行为 |
| --- | --- | --- |
| Docmost 附件失败 | 移除占位，显示失败 | 不创建发布资产 |
| 附件成功，发布图床失败 | 保留 Docmost 图片，显示可重试警告 | 复制前重试；仍失败则阻止生成坏内容 |
| 两者成功 | 插入 Docmost 附件 URL | 复制时使用 publish URL |
| 会话过期或无编辑权限 | 不写入任何目标 | 提示重新从 Docmost 打开或申请权限 |

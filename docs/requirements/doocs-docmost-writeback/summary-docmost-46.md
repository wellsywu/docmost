# DOCMOST-46 完成摘要

## 结果

Doocs 现已支持把当前标题和 Markdown 正文显式保存回原 Docmost 页面。页面绑定来自短期 `mdSession`，保存时重新校验用户和编辑权限，并通过 Docmost 既有 PageService/Yjs 协作链路更新；Redis 协作关闭时改走本地协作处理器，不再静默返回成功。

## 服务端

- 新增 `POST /api/integrations/doocs/content/update`，由 `DoocsSessionGuard` 保护。
- `pageId` 只从会话读取；保存时重新加载页面和用户并调用 `validateCanEdit`。
- bootstrap 返回 `canEdit`、`updatedAt`、`contentHash` 和 Markdown 往返风险。
- 使用更新时间和内容哈希进行乐观冲突检查；冲突返回远程标题、正文和新基线，不覆盖当前草稿。
- 支持空 Markdown 替换和标题同步。
- 检测自定义/非 Markdown 节点；未显式确认风险时服务端拒绝覆盖。表格、图片等 Markdown 原生节点不误报。
- 只读用户不能读取会话上传配置，也不能使用工作区微信/S3 上传服务。
- CollaborationGateway 在 Redis 关闭时调用本地事件处理器，Redis 开启时保持原路由。

## Doocs 交互

- 顶部增加“保存回 Docmost”按钮和 `Ctrl/Cmd+S`。
- 显示未同步、保存中、已同步、冲突、过期、只读和失败状态。
- 本地 IndexedDB 自动保存保持不变；远程保存失败不删除本地草稿。
- 冲突时可以下载本地 Markdown，或明确选择加载远程 Docmost 版本。
- 自定义节点存在格式损失风险时显示警告，并在保存前要求确认。
- 未同步、失败、冲突和会话过期状态离开页面时触发浏览器提醒。

## 验证

- Doocs 服务端：17 个测试套件、69 项通过。
- CollaborationGateway Redis/本地双路径：2 项通过。
- Doocs Web：24 个测试文件、147 项通过。
- Docmost 客户端：16 个测试文件、112 项通过。
- 服务端构建、客户端构建、Doocs Web 类型检查：通过。
- 服务端和 Doocs Web 针对性 ESLint：通过。
- `git diff --check`：通过，仅有仓库既有 CRLF 转换提示。

## 已知边界

- 第一版是显式保存，不是多人实时双向协同。
- 用户确认格式风险后仍可能丢失 Docmost 专有节点；确认对话框和服务端 acknowledgement 防止无提示覆盖。
- 尚未在真实部署中完成双浏览器并发和 Redis 关闭模式的端到端浏览器冒烟，当前由服务级回归测试覆盖。

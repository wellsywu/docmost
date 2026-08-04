# Doocs 编辑内容回写 Docmost

> 日期：2026-08-01
>
> 父需求：DOCMOST-28

## 问题

当前链路只在进入 Doocs 时把 Docmost 页面转换为 Markdown 并加载到 Doocs。用户在 Doocs 中编辑后，内容仅通过 Doocs 的文档仓库存入浏览器 IndexedDB，不会更新原 Docmost 页面。

DOCMOST-28 已明确把“doocs 文档正文的双向同步”排除在原范围外，因此原需求关闭并不代表正文回写已经交付。

## 当前代码边界

- Docmost 的 Doocs `bootstrap` 已能按一次性票据读取页面，并返回 Markdown、标题、设置和短期 `mdSessionToken`。
- Doocs 客户端目前只有 bootstrap、settings 和 upload 调用，没有正文更新 API。
- Doocs 编辑器的本地持久化写入浏览器文档仓库，不包含远程 Docmost 写入。
- Docmost 核心已提供页面 Markdown 更新能力，并通过协作网关写入 Yjs 文档；不应绕过该路径直接改数据库。
- Doocs 短期会话已绑定 `userId + pageId`，可作为受限回写凭证，但保存时仍须重新校验页面编辑权限。

## 关键风险

1. Docmost ProseMirror JSON 转 Markdown 再转回 JSON 不是天然无损；附件、嵌入、引用等自定义节点可能丢失。
2. 用户可能同时在 Docmost 与 Doocs 编辑同一页面，盲目覆盖会造成数据丢失。
3. `pageId` 不能由客户端自由指定，必须取自已签发会话。
4. Doocs 本地草稿与 Docmost 远程版本是两种持久化语义，界面必须明确区分“本地已保存”和“已同步到 Docmost”。

## 目标

允许有编辑权限的用户把当前 Doocs 内容显式、安全地保存回原 Docmost 页面，并提供清晰的保存状态、冲突处理和会话过期恢复。

## 非目标

- 第一版不做多人实时双向协同。
- 第一版不默认启用后台自动覆盖。
- 不允许客户端指定任意页面进行回写。
- 不绕过 Docmost 的 PageService/Yjs 协作更新链路。

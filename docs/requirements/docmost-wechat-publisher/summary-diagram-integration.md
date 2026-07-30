# 图表发布接入收口

> 编写时间：2026-07-30  
> 关联：DOCMOST-18、DOCMOST-21、DOCMOST-22

## 结果

- 修正 Publisher 节点扫描契约：带非空 `attrs.src` 的 drawio 与 Excalidraw
  节点放行；缺少 SVG 来源时仍以包含节点位置的 warning 阻止发布。
- 新增 Docmost 导出契约 fixture，证明 drawio 与 Excalidraw 会经
  `jsonToMarkdown` 导出为 Markdown 图片，SVG URL 得以进入 Publisher 图片管线。
- SVG 使用 `@resvg/resvg-js` 转成 PNG；从微信正文宽度两倍的 1354px 开始，
  超过配置体积上限时降尺寸重试。运行时默认字体明确设为
  `Noto Sans CJK SC`，Docker 镜像安装 `fonts-noto-cjk`。
- Mermaid flowchart 与 sequenceDiagram 在发布级测试中都转成 PNG、上传
  `media/uploadimg`，最终草稿正文只保留微信素材 URL；普通 TypeScript 代码块
  继续保留内联高亮。
- Mermaid 语法错误和 SVG 栅格化错误统一成为可操作的阻断错误：任务状态为
  `blocked`，错误写入 `warnings` 与专用 `errorCode`，不调用图片上传、封面或
  草稿接口；HTTP 返回 422。

## 验证

- `pnpm --filter publisher test`：70 个用例，69 通过，1 个 PostgreSQL 集成
  用例因未设置 `PUBLISHER_TEST_DATABASE_URL` 跳过。
- `pnpm --filter publisher typecheck`：通过。
- `pnpm --filter publisher lint`：通过。
- `pnpm --filter publisher build`：通过。
- `pnpm --filter server exec jest
src/collaboration/markdown-export-contract.spec.ts --runInBand`：3 个用例通过。
- `git diff --check`：通过。

## 仍需外部证据

- 当前机器没有 Docker CLI，未在最终 Linux 镜像内目视确认 Noto CJK 字形。
- DOCMOST-19 仍缺真实认证服务号、AppID/AppSecret、出口 IP 白名单与微信后台
  权限，因此真实 `uploadimg`、封面上传、草稿创建和后台目视验收尚未执行。
- `WECHAT_MAX_IMAGE_BYTES` 仍需用 DOCMOST-19 的实测上限校准；当前代码已经支持
  按配置上限自动降尺寸。

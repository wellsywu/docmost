# 代码评审整改总结

> 编写时间：2026-07-30
> 关联：DOCMOST-18，[summary-local-mvp.md](./summary-local-mvp.md)
>
> 图表接入的后续收口见
> [summary-diagram-integration.md](./summary-diagram-integration.md)；该收口修正了
> 本文早期“drawio/excalidraw 必须整体拦截”的判断。

## 背景

对 `apps/publisher` 的「doocs 接入」部分做代码评审，发现渲染层名实不符：
`DoocsCompatibleRenderer` 并未 vendor 任何 doocs/md 代码，也没有实现微信正文
真正需要的几个行为。评审共记录 5 项高、5 项中、6 项低优先级问题，本次全部整改
并重整了目录结构。

## 高优先级整改

| 问题                                            | 处理                                                                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 外链原样输出，微信会剥离，读者拿不到 URL        | 新增 `rendering/footnotes.ts`，外链转 `文本[n]` + 文末「参考资料」列表；`mp.weixin.qq.com` 域名保留为真实 `<a>`；裸 URL 不重复编号                                                                        |
| highlight.js 生成 span 但无对应 CSS，代码块单色 | `rendering/theme.ts` 补 github-dark 配色的 `.hljs-*` 规则，juice 内联为 `style`                                                                                                                           |
| scanner 放行但渲染端无实现的节点                | 新增 `rendering/markdown-blocks.ts`：callout(`:::`)、details(`<details>`)、mathBlock/mathInline 四个 marked 扩展；后续契约测试证实 drawio/excalidraw 会导出为 SVG 图片，已改为仅在缺少 `attrs.src` 时拦截 |
| Mermaid 把 JSDOM 全局永久注入进程，且并发有竞态 | `rendering/mermaid.ts` 改为「渲染期安装 / 结束还原」全局，并用队列串行化；渲染后清理残留节点                                                                                                              |
| 无图文章必失败；webp/gif 到微信 API 才报错      | 新增 `media/wechat-media.ts`（JPG/PNG 校验，报错含文件名与处理建议）与 `media/default-cover.ts`（`PUBLISHER_DEFAULT_COVER_PATH` 兜底封面）                                                                |

## 中优先级整改

- 文档与事实对齐：README / THIRD_PARTY_NOTICES 不再声称 vendor doocs 代码；
  删除无人引用的 `upstreamRef`；`publish_templates.git_ref` 置空。
- `PUBLISHER_TEMPLATE_VERSION` 默认值改为由样式表哈希推导的 `TEMPLATE_ID`
  （`wechat-r<修订号>-<hash12>`）。它参与幂等 key，模板变更不会再复用旧草稿。
- 光栅化改用 `@resvg/resvg-js` 的 `renderAsync`，不再阻塞事件循环。
- 鉴权开关改为显式 `PUBLISHER_AUTH_ENABLED`（默认开），不再用「token 里是否含
  placeholder」正则推断；live 模式强制要求为开。
- docker-compose 新增 `publisher` profile（连接器 + 独立 `publisher-db`），
  配套 `apps/publisher/Dockerfile`；未选该 profile 时主栈不受影响。
- `.gitignore` 的 `docs/` 反选从 7 行简化到 4 行。

## 低优先级整改

`new Map<string, BinaryAsset>()` 补类型参数；mermaid / publish-config 围栏正则
锚定行首并容忍多于三个反引号；替换文案前后补空行；标题超 64 字在建 job 前拦截
（`InvalidArticleError` → HTTP 422）；envFlag 接受 `true/false/yes/no/on/off`；
同一图片单篇内只下载上传一次；移除未使用的 `mime-types` 依赖。

## 目录结构调整

```
src/
  app.ts            仅路由与装配
  http/             auth.ts（鉴权钩子）、console.ts（控制台 HTML）
  core/             hash.ts、types.ts、html.ts
  rendering/        renderer.ts、theme.ts、footnotes.ts、markdown-blocks.ts、mermaid.ts
  media/            rasterizer.ts、wechat-media.ts、default-cover.ts、asset-publisher.ts
  wechat/           port.ts、mock-client.ts、live-client.ts（原单文件 wechat.ts 拆分）
  docmost/ publication/ database/   不变
test/               按领域拆分，helpers.ts 收拢夹具（原先散在 src 根目录）
```

`DoocsCompatibleRenderer` 更名为 `WeChatArticleRenderer`；`src/assets/` 并入
`src/media/`。

## 问题与解决方案（重点）

1. **marked 扩展的 token 类型**：`interface X extends Token` 报 TS2312，因为
   `Token` 是联合类型。改为继承 `Tokens.Generic`（带索引签名），tokenizer 可直接
   返回对象字面量，无需 `as unknown as Token`。
2. **行内公式误判**：`$5 和 $10` 会被当成公式。tokenizer 正则要求开头 `$` 后与
   结尾 `$` 前均为非空白字符（`/^\$(?![\s$])([^\n$]*[^\s\\$])\$/`），已加回归测试。
3. **details 的内层 Markdown**：Docmost 导出的是原始 `<details>` HTML 块，marked
   会整块透传、DOMPurify 再整块剥离，正文里的 Markdown 不会被解析。解法是用块级
   扩展抢在 html tokenizer 之前接管，summary 走 `inlineTokens`、正文走
   `blockTokens`，渲染成 `<section class="details">` + 加粗摘要行。
4. **全局还原的时机**：mermaid 模块在 `import` 时就会捕获 DOM 引用，因此 JSDOM
   window 实例进程内只创建一次并常驻，只有 `globalThis` 上的键在每次渲染前后
   安装/还原；否则第二次渲染会拿到失效引用。
5. **Docker 运行阶段的依赖**：runtime 阶段单独 `pnpm install --filter publisher
--prod --frozen-lockfile` 会因缺少其它 workspace 包的 package.json 而失败。改为
   从 builder 原样复制 `/app/node_modules` 与 `/app/apps/publisher/node_modules`
   （pnpm 的软链目标路径一致，可正常解析）。

## 验证

- `pnpm --filter publisher typecheck` / `lint` / `build`：通过。
- `pnpm --filter publisher test`：70 个用例，69 通过、1 跳过（未设置
  `PUBLISHER_TEST_DATABASE_URL` 的 PostgreSQL 集成用例）。
- 构建产物冒烟：`dist/main.js` 装配成功，`/health` 返回
  `templateVersion: wechat-r3-…`，`/api/*` 无 token 401、带 token 200。
- 渲染实测：外链脚注、hljs 内联配色、callout/details/math、mermaid 转 PNG 均按预期
  输出。

## 未验证项

`apps/publisher/Dockerfile` 与 docker-compose 的 `publisher` profile 为本次新增，
本机无 Docker 环境，**尚未实际构建运行**。首次使用前需自行 `docker compose
--profile publisher build` 验证。DOCMOST-19 的真实微信验收证据仍然缺失，未做任何
声称。

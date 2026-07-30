# Plan C：账号入 publisher 的库，doocs/md 只当"预览排版台"

> 编写时间：2026-07-30
> Plan Type: C

## 方案描述

**先把"账号入库"这件事单独做完**，跳转按最省的方式接。

- 微信账号（AppID/AppSecret/名称/类型）建表进 **publisher 已有的 Postgres**——它已经有
  迁移体系、UUID v7、审计表，`WECHAT_*` 环境变量降级为"没有账号记录时的兜底"。
- publisher 控制台加一个账号管理页；`/api/publications` 请求体加 `accountId`。
- doocs/md 自建部署，**不改它的存储模型**，只用作人工排版预览：Docmost 顶部按钮出一个
  下拉，「发布到微信草稿」走 publisher，「在 doocs/md 里排版」走 `?open=` 签名 URL。
- doocs 的配置继续留在浏览器（主题、模板这类偏好本来就是个人化的），
  **但 doocs 里不再填 AppID/AppSecret** —— 图床改用 publisher 的上传代理。

### 跳转

两个动作分开，不强行合并成一条链路：

| 入口                 | 行为                                                        |
| -------------------- | ----------------------------------------------------------- |
| 发布到微信草稿       | 打开 publisher 控制台 `?pageId=&accountId=`（现状小改）       |
| 在 doocs/md 里排版   | 打开 `https://md.xxx/?open=<签名正文 URL>`，人工调完手动发   |

## 优点

- **最快拿到用户明确要的那一半**：账号入库、多账号可选、AppSecret 只在服务端。
  publisher 的库和迁移体系是现成的，不需要新建服务。
- 不用 fork doocs/md，上游可以随时升级。
- 职责清晰：publisher 管"自动建草稿"，doocs 管"人工精修排版"，不互相污染。
- 可以作为 A 的第一阶段——账号表将来整体搬到 Docmost 也不返工。

## 缺点

- **doocs 的配置没有入库**，只解决了需求的一半。主题/模板换台机器仍要重配。
- 两个控制台两套 UI，用户要理解"什么时候点哪个"。
- publisher 需要新增图床代理接口，否则 doocs 里没法传图。
- 如果最终目标就是 A，这里的账号管理 UI 会做两遍（publisher 控制台一遍、Docmost 设置页一遍）。

## 实现步骤

1. publisher：`wechat_accounts` migration（含加密列）+ store + 控制台账号页。
2. publisher：`/api/publications` 支持 `accountId`，env 降级为兜底。
3. publisher：`POST /api/media/upload` 图床代理（复用现成的 `media/` 模块）。
4. Docmost：顶部按钮从单个图标改为下拉两项；新增签名正文接口供 `?open=` 用。
5. doocs/md：只改图床 provider 配置，指向 publisher 代理。

## 预估工作量

小到中。publisher 2～3 天，Docmost 侧 1 天，doocs 侧 0.5 天。

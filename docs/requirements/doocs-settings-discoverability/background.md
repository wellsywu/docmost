# Doocs 设置入口不可发现

> 日期：2026-08-01
>
> 父需求：DOCMOST-28
>
> 关联已完成项：DOCMOST-33

## 问题

管理员反馈在 Docmost 中看不到 Doocs/微信相关设置入口。DOCMOST-33 已按“设置页新增微信公众号账号管理界面”完成关闭，因此本项按已交付能力的可发现性缺陷处理，不重复建设账号 CRUD。

## 当前证据

- `apps/client/src/features/integrations/doocs/settings-nav.ts` 已声明管理员菜单项，当前名称为“微信公众号”，路径为 `/settings/wechat`。
- `apps/client/src/components/settings/settings-sidebar.tsx` 已把菜单项加入 Workspace 设置分组，并对非管理员隐藏。
- `apps/client/src/App.tsx` 已注册 `/settings/wechat` 路由。
- `apps/client/src/pages/settings/integrations/doocs-settings.tsx` 已渲染 Doocs 设置、上传服务和公众号账号管理。
- 线上前端 bundle 包含相同菜单项和路由；线上唯一用户角色为 owner，应满足管理员判断。

因此，当前问题不是功能或部署缺失。现有入口名称“微信公众号”与页面标题“Doocs”、用户寻找的“Doocs 设置”不一致；入口又位于较长的 Workspace 设置列表中，容易被误判为不存在。仍需浏览器会话验证实际滚动、折叠和权限状态。

## 目标

让 owner/admin 能明确找到 Doocs 设置，理解其中同时包含编辑器、图片上传服务和公众号账号配置；member 不获得工作区级密钥和上传服务配置权限。

## 非目标

- 不重新实现 DOCMOST-33 已完成的账号 CRUD。
- 不把工作区级敏感配置开放给普通成员。
- 不在本项实现 Doocs 正文回写。

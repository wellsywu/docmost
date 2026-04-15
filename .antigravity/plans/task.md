# API Key 方案B 执行任务

## 任务列表

- [x] Step 1：安装 passport-custom 依赖
- [x] Step 2：新建 api-key.strategy.ts
- [x] Step 3：重构 api-key.service.ts（随机 token + sha256 存储）
- [x] Step 4：修改 jwt.strategy.ts（跳过 dm_sk_，移除 API_KEY 分支）
- [x] Step 5：修改 jwt-auth.guard.ts（AuthGuard(['jwt', 'api-key']) 多策略模式）
- [x] Step 6：修改 api-key.module.ts（注册 ApiKeyStrategy，移除 TokenModule）
- [ ] Step 7：验证代码逻辑

## 实现详情

### Step 1 — 安装依赖
- `passport-custom@^1.1.1` 已添加到 `apps/server/package.json`
- `@types/passport-custom` 不存在（npm 404），`passport-custom` 自带 TypeScript 类型

### Step 2 — 新建 api-key.strategy.ts
- 文件：`apps/server/src/core/api-key/api-key.strategy.ts`
- 使用 `passport-custom` 的 `Strategy`
- 策略名：`api-key`
- 非 `dm_sk_` 前缀的 token 调用 `done(null, false)` 跳过，交给 JwtStrategy

### Step 3 — api-key.service.ts（已完成）
- `create()` 生成 `dm_sk_` + 64 hex 字符随机 token
- 存储 `sha256(token)` 到 `keyHash` 字段
- `validateApiKey(rawToken)` 计算 hash 查库验证

### Step 4 — jwt.strategy.ts（已完成）
- `jwtFromRequest` 中 `dm_sk_` 前缀 token 返回 null（跳过）
- 已删除 `API_KEY` 类型分支和 `validateApiKey` 私有方法
- 已移除 `ModuleRef` 依赖

### Step 5 — jwt-auth.guard.ts
- `AuthGuard('jwt')` → `AuthGuard(['jwt', 'api-key'])`
- 移除手动 `handleApiKeyAuth()` 方法和 `require()` hack
- 移除 `ModuleRef` 依赖注入
- 保留 `handleRequest`、`setJoinedWorkspacesCookie` 等原有逻辑

### Step 6 — api-key.module.ts
- 移除 `TokenModule` import
- 添加 `ApiKeyStrategy` 到 providers

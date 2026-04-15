# API Key 重构为随机 Opaque Token 实现计划

> 所属功能：feat/apiKey
> 方案：方案 B — 彻底重构为原生随机 Key（业内最佳实践）
> 创建时间：2026-04-15
> 状态：待执行

---

## 一、方案背景

### 当前问题

当前 API Key 本质是标准 JWT（`eyJ...` 开头），存在以下缺陷：

1. **暴露内部信息**：Base64 解码后可见 `{sub, workspaceId, apiKeyId, type, iat, exp}`
2. **强依赖 APP_SECRET**：轮换 `APP_SECRET` 会导致所有 API Key **立即全部失效**
3. **无法安全存储**：如果想在 DB 中存储 key 的哈希（防脱库），JWT 方案无法做到（因为验证需要解码 payload）
4. **无法撤销即时生效**：虽然有软删除，但 JWT 签名验证在数据库查询前先通过，理论上存在时间窗口问题

### 目标方案

- Token 格式：`dm_sk_<64位随机 hex>`（总长度 70 字符）
- 数据库只存 `sha256(token)`，**原始 token 只在创建时返回一次**
- 验证：`sha256(Bearer token)` → 查库 → 找到对应用户/工作空间
- 与 JWT 体系完全独立，不影响普通 Session 登录逻辑

---

## 二、代码层关键验证分析

### 2.1 撤销（Revoke）功能验证 ✅

**当前 revoke 实现**（`api-key.service.ts`）：

```typescript
await this.db
  .updateTable('apiKeys')
  .set({ deletedAt: new Date() })   // 软删除
  .where('id', '=', apiKeyId)
  .execute();
```

**Plan B 的 validateApiKey 查询**：

```typescript
const apiKey = await this.db
  .selectFrom('apiKeys')
  .where('keyHash', '=', keyHash)   // 匹配 hash
  .where('deletedAt', 'is', null)   // ← 撤销后此条件不满足
  .executeTakeFirst();

if (!apiKey) throw new UnauthorizedException('API Key 不存在或已被撤销');
```

**结论**：Revoke 设置 `deletedAt` 后，下次验证查询 `WHERE deleted_at IS NULL` 不命中 → 立即返回 401。
**撤销即时生效，无时间窗口问题（比 JWT 方案更安全）。✅**

---

### 2.2 重命名（Rename）功能验证 ✅

**当前 update 实现**（`api-key.service.ts`）：

```typescript
const updated = await this.db
  .updateTable('apiKeys')
  .set({ name: dto.name, updatedAt: new Date() })   // 只更新 name
  .where('id', '=', dto.apiKeyId)
  .returning([...])
  .executeTakeFirst();
```

**验证数据流**：

```
rename 操作:  UPDATE api_keys SET name='new name' WHERE id=?
              ↓ key_hash 字段 NOT CHANGED

validate 流程: sha256(dm_sk_xxx) → 查 WHERE key_hash=? AND deleted_at IS NULL
              ↓ 匹配到记录（key_hash 未变）
              → 找到 creatorId / workspaceId → 查用户 → 通过 ✅
```

**结论**：`update()` 只改 `name` 字段，`key_hash` 与 `deletedAt` 均不受影响，重命名后 Token 继续有效。✅

---

### 2.3 多个 API Key 共存的验证隔离性 ✅

#### 数据库约束层面

从迁移文件 `20260410T000000-api-key-hash.ts`：

```typescript
.addColumn('key_hash', 'text', (col) => col.unique())   // ← UNIQUE 约束
```

**`key_hash` 字段有 UNIQUE 约束**，数据库层面保证两个 key 不可能有相同 hash。

#### 验证唯一性保证

```
用户有 3 个 API Key：
  K1 = dm_sk_aaa...  →  key_hash = sha256(K1) = H1
  K2 = dm_sk_bbb...  →  key_hash = sha256(K2) = H2
  K3 = dm_sk_ccc...  →  key_hash = sha256(K3) = H3

请求携带 K2:
  sha256(K2) = H2
  SELECT * FROM api_keys WHERE key_hash = 'H2' AND deleted_at IS NULL
  → 精确匹配到 K2 对应记录（不会误匹配 K1 或 K3）
  → 返回 K2 的 creator_id / workspace_id
```

**sha256 碰撞概率**：2^-128，对于 32 字节随机输入实际上不可能碰撞。

**结论**：多个 Key 共存时，验证通过 `key_hash` 精确匹配，相互完全隔离，不会串混。✅

---

### 2.4 旧 JWT 格式 API Key 的处理

**Plan B 后的情况**：

旧 JWT API Key（`eyJ...`）请求进来时：
1. `ApiKeyStrategy`：`Bearer token` 不以 `dm_sk_` 开头 → `done(null, false)` 跳过
2. `JwtStrategy`：`jwtFromRequest` 检测到非 `dm_sk_` → 正常提取 JWT → Passport 解码
3. `jwt.strategy.ts validate()` 中我们删除了 `API_KEY` 分支
4. `payload.type === JwtType.API_KEY` 到达 `if (payload.type !== JwtType.ACCESS)` → **抛出 UnauthorizedException**

**结论**：旧 JWT API Key 在 Plan B 后**立即失效**（因为移除了 `API_KEY` 类型处理分支）。这是预期行为，需要在部署说明中告知用户。

---

### 2.5 UNIQUE 约束与 NULL 兼容性

迁移 `20260410T000000-api-key-hash.ts` 中，`key_hash` 是 `col.unique()` 但没有 `notNull()`。

PostgreSQL 对 UNIQUE 约束的行为：**NULL 值不参与唯一性检查**（多行均为 NULL 不会违反 UNIQUE 约束）。

这意味着：
- **已有旧记录** `key_hash = NULL`（当前 JWT 方案未写入）→ 不影响新 key 的插入
- **新插入**的 key 写入 sha256 值 → UNIQUE 约束正常生效

**结论**：无需清理历史记录即可安全执行迁移。✅

---

## 三、执行步骤（按顺序）

### Step 1：安装依赖

```bash
cd apps/server
pnpm add passport-custom
pnpm add -D @types/passport-custom
```

### Step 2：新建 `api-key.strategy.ts`

**路径**：`apps/server/src/core/api-key/api-key.strategy.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { ApiKeyService } from './api-key.service';
import { FastifyRequest } from 'fastify';
import { extractBearerTokenFromHeader } from '../../common/helpers';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly apiKeyService: ApiKeyService) {
    super();
  }

  async validate(req: FastifyRequest, done: Function): Promise<any> {
    // 从 Authorization: Bearer <token> 提取
    const token = extractBearerTokenFromHeader(req as any);

    // 不是 dm_sk_ 开头，不是 API Key，跳过给 JWT Strategy 处理
    if (!token || !token.startsWith('dm_sk_')) {
      return done(null, false);
    }

    try {
      const result = await this.apiKeyService.validateApiKey(token);
      return done(null, result);
    } catch {
      return done(null, false);
    }
  }
}
```

### Step 3：重构 `api-key.service.ts`

**主要变更**：

```typescript
// 移除：TokenService、JwtApiKeyPayload 的引用

// create() 核心变更
import * as crypto from 'crypto';

async create(dto, user, workspace) {
  // 生成随机 Opaque Token
  const rawToken = 'dm_sk_' + crypto.randomBytes(32).toString('hex');
  // 计算 sha256
  const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const record = await this.db
    .insertInto('apiKeys')
    .values({
      name: dto.name,
      creatorId: user.id,
      workspaceId: workspace.id,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      keyHash,  // 存 hash，不存原始 token
    })
    .returning([...])
    .executeTakeFirst();

  return {
    ...record,
    token: rawToken,  // 唯一一次返回原始 token
    creator: { ... },
  };
}

// validateApiKey 签名变更：接收原始 token 字符串
async validateApiKey(rawToken: string): Promise<{ user, workspace }> {
  const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const apiKey = await this.db
    .selectFrom('apiKeys')
    .selectAll()
    .where('keyHash', '=', keyHash)
    .where('deletedAt', 'is', null)
    .executeTakeFirst();

  if (!apiKey) throw new UnauthorizedException('API Key 不存在或已被撤销');
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    throw new UnauthorizedException('API Key 已过期');
  }

  // 异步更新 lastUsedAt（不阻塞）
  this.db.updateTable('apiKeys')
    .set({ lastUsedAt: new Date() })
    .where('keyHash', '=', keyHash)
    .execute().catch(() => {});

  const user = await this.userRepo.findById(apiKey.creatorId, apiKey.workspaceId);
  const workspace = await this.workspaceRepo.findById(apiKey.workspaceId);

  if (!user) throw new UnauthorizedException('用户不存在');
  if (!workspace) throw new UnauthorizedException('工作空间不存在');

  return { user, workspace };
}
```

### Step 4：修改 `jwt.strategy.ts`

**变更 1**：`jwtFromRequest` 跳过 `dm_sk_` token

```typescript
jwtFromRequest: (req: FastifyRequest) => {
  const bearer = extractBearerTokenFromHeader(req);
  // dm_sk_ token 交给 ApiKeyStrategy 处理，JwtStrategy 不处理
  if (bearer?.startsWith('dm_sk_')) return null;
  return req.cookies?.authToken || bearer;
},
```

**变更 2**：删除 `API_KEY` 处理分支和 `validateApiKey` 私有方法

```typescript
// 删除：
// if (payload.type === JwtType.API_KEY) {
//   return this.validateApiKey(req, payload as JwtApiKeyPayload);
// }

// 删除：
// private async validateApiKey(...) { ... }
```

**变更 3**：移除 `ModuleRef` 依赖（不再需要动态加载 ApiKeyService）

### Step 5：修改 `jwt-auth.guard.ts`

```typescript
// 由
export class JwtAuthGuard extends AuthGuard('jwt') {
// 改为
export class JwtAuthGuard extends AuthGuard(['jwt', 'api-key']) {
```

> NestJS + Passport 的多策略模式：顺序尝试，任一成功即通过认证。

### Step 6：修改 `api-key.module.ts`

```typescript
@Module({
  imports: [DatabaseModule],          // 不再需要 TokenModule
  controllers: [ApiKeyController],
  providers: [ApiKeyService, ApiKeyStrategy],   // 添加 ApiKeyStrategy
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
```

---

## 四、变更汇总

| 文件 | 操作 | 核心变更 |
|---|---|---|
| `api-key/api-key.service.ts` | MODIFY | create 改用随机 token + sha256；validateApiKey 改为接收原始字符串查 hash |
| `api-key/api-key.strategy.ts` | NEW | Passport Custom 策略，处理 dm_sk_ 令牌 |
| `api-key/api-key.module.ts` | MODIFY | 移除 TokenModule；添加 ApiKeyStrategy |
| `auth/strategies/jwt.strategy.ts` | MODIFY | jwtFromRequest 跳过 dm_sk_；删除 API_KEY 分支和 validateApiKey 方法；移除 ModuleRef |
| `common/guards/jwt-auth.guard.ts` | MODIFY | AuthGuard('jwt') → AuthGuard(['jwt', 'api-key']) |

---

## 五、关键风险和注意事项

| 风险点 | 说明 | 应对措施 |
|---|---|---|
| 旧 Key 立即失效 | 所有 JWT 格式 API Key 在部署后无法验证 | 提前通知用户重建 API Key |
| `passport-custom` 包 | 需要额外安装依赖 | Step 1 安装 |
| UNIQUE 约束冲突 | 新 key 插入时若 sha256 已存在（理论概率极低）| 捕获 DB 唯一约束错误并重试 |
| `key_hash` 为 NULL 的旧记录 | 历史记录 key_hash 为空，UNIQUE 约束不影响新插入 | PostgreSQL 的 NULL 不参与 UNIQUE 检查，无需处理 |

---

## 六、验证方案

### 功能验证矩阵

| 场景 | 期望结果 | 验证方法 |
|---|---|---|
| 创建 API Key | 返回 `dm_sk_` 开头的 token | POST /api-keys/create |
| 使用有效 token 请求接口 | 200 正常通过 | 带 Bearer dm_sk_xxx 请求受保护接口 |
| token 写错任意字符 | 401 Unauthorized | 修改 token 后再请求 |
| 撤销后使用被撤销的 token | 立即 401，无时间窗口 | 撤销后立刻再请求 |
| 重命名后使用原始 token | 200 正常通过 | 重命名后继续用旧 token |
| 用户有 3 个 key，各自独立有效 | 3 个 token 分别验证均通过 | 创建3个 key 分别测试 |
| 普通 Session JWT 登录 | 不受影响，正常 200 | 浏览器登录后访问首页 |
| 旧 JWT 格式 API Key（如有） | 401 Unauthorized | 发送 eyJ... 格式的旧 token |

---

## 七、执行总结（执行后填写）

> 此区域在执行完成后追加。

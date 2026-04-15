# 登录后无法跳转首页（停留在登录页）问题 SOP

> 版本：v1.0
> 记录时间：2026-04-15
> 状态：已验证解决

---

## 一、问题描述

**现象**：用户在登录页输入正确的账号密码，点击登录后，页面**不跳转到首页，始终停留在登录页**。没有任何错误弹窗，表现像是登录失败但无提示。

**复现条件**：通过 **HTTP** 协议访问 Docmost（如 `http://your-server:3000`）。

**不复现条件**：通过 **HTTPS** 协议访问（如 `https://your-domain.com`）时，登录正常跳转。

---

## 二、根本原因分析

### 2.1 登录认证流程（节选关键步骤）

```
用户提交账号密码
  → POST /auth/login
  → 认证成功，生成 JWT accessToken
  → 服务端调用 setAuthCookie(res, token)    ← 关键点
  → 前端 navigate(getPostLoginRedirect())   → 跳转到首页

首页加载
  → useCurrentUser() → POST /users/me
  → JwtAuthGuard 提取 cookie 'authToken'   ← 如果 cookie 发送失败 → 401
  → 返回用户信息 → 正常渲染首页
```

### 2.2 Cookie 的 Secure 属性

服务端在 `auth.controller.ts` 中设置 Cookie：

```typescript
// apps/server/src/core/auth/auth.controller.ts
setAuthCookie(res: FastifyReply, token: string) {
  res.setCookie('authToken', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: this.environmentService.getCookieExpiresIn(),
    secure: this.environmentService.isHttps(),   // ← 关键：根据 APP_URL 协议决定
  });
}
```

### 2.3 isHttps() 的判断逻辑

```typescript
// apps/server/src/integrations/environment/environment.service.ts
isHttps(): boolean {
  const appUrl = this.configService.get<string>('APP_URL');
  try {
    const url = new URL(appUrl);
    return url.protocol === 'https:';   // APP_URL 以 https:// 开头时返回 true
  } catch (error) {
    return false;
  }
}
```

### 2.4 问题触发链条

| 场景 | `APP_URL` 配置 | `isHttps()` | Cookie `Secure` 属性 | HTTP 下是否发送 cookie | 结果 |
|---|---|---|---|---|---|
| 正常 HTTPS 访问 | `https://wiki.example.com` | `true` | `Secure=true` | ❌ 不发送（正确行为） | ✅ HTTPS 正常 |
| **问题场景** | `https://wiki.example.com` | `true` | `Secure=true` | ❌ **不发送** | ❌ HTTP 下 `/users/me` 返回 401，卡在登录页 |
| HTTP 访问正常 | `http://your-server:3000` | `false` | 无 Secure 标志 | ✅ 发送 | ✅ 正常 |

**根本原因**：当 `APP_URL` 配置为 `https://` 但用户通过 `http://` 访问时：
1. 服务端设置的 `authToken` Cookie 带有 `Secure` 标志
2. 浏览器对 `Secure` Cookie 的规范：**只在 HTTPS 连接下发送**，HTTP 连接下完全忽略此 Cookie
3. 后续 `/users/me` 请求中无 Cookie → `JwtAuthGuard` 返回 `401 Unauthorized`
4. 前端检测到 401 → 保持在登录页（可能静默重定向回 `/login`）

---

## 三、验证方案

### 验证步骤

1. 打开浏览器开发者工具 → Network 面板
2. 登录成功后，观察 `POST /users/me` 的响应状态
   - **401** → 确认为此问题（Cookie 未发送）
   - **200** → 需要排查其他原因

3. 查看 Application → Cookies，登录后 `authToken` 是否出现：
   - 若有但带有 🔒 标记（Secure）→ 确认是本问题
   - 若完全没有 → 排查 Cookie 设置是否报错

### 核心检查命令

```bash
# 检查 APP_URL 配置（在容器内）
docker compose exec docmost printenv APP_URL
# 正确示例：https://wiki.example.com
# 错误示例与 http:// 访问共存时会触发此问题
```

---

## 四、解决方案

### 方案 A（推荐）：统一使用 HTTPS 访问

**永远通过 HTTPS 访问**，与 `APP_URL = https://your-domain.com` 保持一致。在 Nginx 中强制将 HTTP 重定向到 HTTPS：

```nginx
server {
    listen 80;
    server_name wiki.example.com;
    # 强制跳转 HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name wiki.example.com;
    # ... 其余 HTTPS 配置
}
```

### 方案 B：本地开发/内网 HTTP 访问

如需 HTTP 访问（如内网测试），将 `APP_URL` 改为 `http://` 协议：

```yaml
# docker-compose.yml
environment:
  APP_URL: 'http://192.168.1.100:3000'   # HTTP 协议
```

此时 `isHttps()` 返回 `false`，Cookie 不带 `Secure` 标志，HTTP 下可正常传送。

> ⚠️ **警告**：HTTP 下的 Cookie 存在安全风险（可被中间人截获），**仅限内网或本地开发使用**。

### 方案 C（兼容）：Nginx 内部转发 + APP_URL 用 HTTP

如果 Nginx 在外部做 HTTPS 卸载（SSL Termination），内部用 HTTP 转发到应用：

```yaml
# docker-compose.yml - APP_URL 写内部 HTTP 地址
environment:
  APP_URL: 'https://wiki.example.com'   # 对外域名用 https
```

```nginx
# Nginx 配置中添加 X-Forwarded-Proto 头
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
    # ...
}
```

> 说明：关键在于 `APP_URL` 与**用户实际访问的协议一致**。若用户从 HTTPS 访问，`APP_URL` 就配 `https://`；若用户从 HTTP 访问，就配 `http://`。

---

## 五、总结

| 配置 | 用户访问方式 | 结果 |
|---|---|---|
| `APP_URL=https://...` | HTTPS 访问 | ✅ 正常 |
| `APP_URL=https://...` | **HTTP 访问** | ❌ **Cookie 不发送，登录卡死** |
| `APP_URL=http://...` | HTTP 访问 | ✅ 正常（HTTP 安全风险） |
| `APP_URL=http://...` | HTTPS 访问 | ⚠️ Cookie 无 Secure，可能不符合安全预期 |

**核心原则**：**`APP_URL` 的协议必须与用户实际访问的协议一致。**

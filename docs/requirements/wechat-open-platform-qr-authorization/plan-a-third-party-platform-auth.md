# Plan A: official third-party-platform QR authorization

## Prerequisites

- An approved WeChat Open Platform third-party platform.
- Component AppID and AppSecret configured server-side.
- Public HTTPS endpoints for authorization events and authorization callbacks.
- Encrypted storage for component and authorizer refresh credentials.
- Declared permissions that cover the WeChat APIs Docmost intends to call.

## Interaction

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'background':'#0f172a','primaryColor':'#1e293b','primaryTextColor':'#22d3ee','primaryBorderColor':'#38bdf8','lineColor':'#38bdf8','edgeColor':'#38bdf8','clusterTextColor':'#38bdf8','secondaryColor':'#334155','tertiaryColor':'#0f172a','mainBkg':'#1e293b','nodeBorder':'#38bdf8','clusterBkg':'transparent','clusterBorder':'#06b6d4','edgeLabelBackground':'transparent','fontFamily':'"JetBrains Mono", "Fira Code", monospace','fontSize':'14px'}, 'flowchart':{'curve':'basis'}}}%%
flowchart TD

classDef blue fill:#3B82F6,stroke:#60A5FA,color:#fff,rx:15,ry:15
classDef red fill:#DC2626,stroke:#F87171,color:#fff,rx:15,ry:15
classDef purple fill:#7C3AED,stroke:#A78BFA,color:#fff,rx:15,ry:15
classDef orange fill:#EA580C,stroke:#FB923C,color:#fff,rx:15,ry:15
classDef green fill:#16A34A,stroke:#4ADE80,color:#fff,rx:15,ry:15
classDef slate fill:#475569,stroke:#94A3B8,color:#fff,rx:15,ry:15
classDef amber fill:#D97706,stroke:#FCD34D,color:#fff,rx:15,ry:15

start(["管理员选择扫码授权"]):::slate

subgraph prepare ["授权准备"]
configured{"第三方平台已配置？"}:::blue
blocked["展示平台资质和回调配置要求"]:::red
componentToken["获取 component access token"]:::purple
preAuth["获取 pre auth code"]:::purple
qr["展示微信官方授权二维码"]:::amber
end

subgraph authorize ["管理员授权"]
scan["公众号管理员扫码并确认权限"]:::amber
callback["微信回调一次性 auth code"]:::purple
exchange["换取 authorizer refresh token"]:::blue
end

subgraph persist ["账号入库"]
accountInfo["读取公众号名称、类型和权限"]:::purple
secureStore[("加密保存刷新凭据")]:::orange
done(["公众号授权完成"]):::green
end

start --> configured
configured -->|"否"| blocked
configured -->|"是"| componentToken --> preAuth --> qr --> scan --> callback --> exchange --> accountInfo --> secureStore --> done

linkStyle default stroke:#38bdf8,stroke-width:2px;
style prepare fill:transparent,stroke:#06b6d4,stroke-width:2px,stroke-dasharray:5,5,color:#38bdf8
style authorize fill:transparent,stroke:#06b6d4,stroke-width:2px,stroke-dasharray:5,5,color:#38bdf8
style persist fill:transparent,stroke:#06b6d4,stroke-width:2px,stroke-dasharray:5,5,color:#38bdf8
```

## Credential modes

The account model must distinguish:

- `manual_secret`: AppID plus encrypted AppSecret.
- `open_platform`: authorizer AppID plus encrypted authorizer refresh token and granted scopes.

The upload service obtains a current access token from the appropriate credential provider. Manual onboarding remains available as a fallback.

## Failure and lifecycle states

- Platform not configured: QR entry is disabled with prerequisites.
- QR expired: regenerate a pre-authorization code without losing the settings page state.
- Authorization denied or callback invalid: do not create an account.
- Authorization revoked: mark the account disconnected and stop token refresh.
- Granted scopes insufficient: show the missing capability rather than treating the account as fully usable.

# Plan A: verified manual AppID/AppSecret setup

## Interaction

The modal has two required fields: AppID and AppSecret. Submission validates the credentials against WeChat before the encrypted secret is stored. Account naming becomes optional metadata that can be edited after creation. The manually controlled authenticated switch is removed.

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

start(["管理员添加公众号"]):::slate
input["输入 AppID 和 AppSecret"]:::amber
validate["服务端请求微信验证凭据"]:::blue
valid{"凭据是否有效？"}:::blue
error["显示凭据或 IP 白名单错误"]:::red
encrypt["加密保存 AppSecret"]:::orange
status["显示凭据已验证状态"]:::green
rename["可选：修改展示名称"]:::slate
done(["账号可用于微信图片上传"]):::green

start --> input --> validate --> valid
valid -->|"否"| error --> input
valid -->|"是"| encrypt --> status --> rename --> done

linkStyle default stroke:#38bdf8,stroke-width:2px;
```

## Data and compatibility

- Keep the existing AppID/AppSecret credential mode.
- Preserve encrypted-at-rest and never-return-secret behavior.
- Distinguish "credential validation" from the official account's WeChat verification category.
- Existing accounts continue to work and can be revalidated explicitly.

## Validation

- Component tests cover the reduced form and the absence of a manual authenticated switch.
- Server tests cover valid credentials, invalid credentials, IP allowlist errors, encryption, and secret redaction.
- Existing account and image upload tests remain green.

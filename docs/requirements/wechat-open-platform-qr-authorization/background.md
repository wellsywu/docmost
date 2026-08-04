# Background: WeChat Open Platform QR authorization

## Why a normal official account cannot provide this QR flow

Scanning a QR code to let a third-party product manage an official account is a WeChat Open Platform third-party-platform authorization flow. It is not a capability exposed by an ordinary official account's AppID/AppSecret configuration.

The deploying organization must first create and pass review for a WeChat Open Platform third-party platform. The deployment also needs public HTTPS authorization and event callback endpoints. WeChat pushes a component verification ticket to that platform; the platform uses its component credentials and ticket to obtain a component access token and pre-authorization code.

After an official-account administrator scans and approves, WeChat redirects with an authorization code. Docmost exchanges it for an authorizer access token and authorizer refresh token. The account's own AppSecret is not disclosed.

## Why this is low priority

- Manual AppID/AppSecret onboarding already works.
- The capability depends on an external platform application, review, public callback infrastructure, IP allowlisting, and operational token refresh.
- It is not universally usable by every self-hosted deployment.
- The current integration mainly uses account credentials for WeChat image upload; full draft/publish API integration is separate work.

## Security boundary

Do not implement QR login by automating `mp.weixin.qq.com`, capturing browser cookies, or asking administrators to export session data. Only the official third-party-platform authorization protocol is acceptable.

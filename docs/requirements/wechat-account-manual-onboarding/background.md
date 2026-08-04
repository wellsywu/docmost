# Background: simplify manual WeChat account onboarding

## Current behavior

The Docmost Doocs settings page asks an administrator for an account name, AppID, AppSecret, and a manually controlled "authenticated" switch.

Only AppID and AppSecret are required to obtain a WeChat `stable_token`. The account name is local display metadata. The current authenticated flag is also local metadata; setting it does not prove that WeChat accepted the credentials.

## Problem

- Administrators must understand four fields before they can use WeChat image upload.
- The authenticated switch looks like a server-verified status but is currently self-declared.
- Invalid credentials and IP allowlist failures are discovered later during image upload rather than when the account is added.
- The AppSecret is sensitive, so the shortest safe path should validate and encrypt it immediately.

## Why this is low priority

The current AppID/AppSecret path is functional and remains a necessary fallback even if QR authorization is introduced. This issue improves clarity and error timing but does not unblock the current integration.

## Boundaries

This requirement does not add WeChat Open Platform QR authorization, browser-cookie login, or direct article publishing APIs.

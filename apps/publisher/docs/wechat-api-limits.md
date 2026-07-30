# WeChat API capability and limits

Status: awaiting DOCMOST-19 real-account probe.

This file records only contracts confirmed from the official documentation on
2026-07-30. Account-specific capabilities and measured limits remain unknown
until a real account is stored in the shared integration database, the
Publisher egress IP allowlist is configured, and WeChat backend access is
available. AppID/AppSecret are not Publisher environment variables.

## Confirmed request chain

1. `POST /cgi-bin/stable_token`
   - JSON body: `grant_type`, `appid`, `secret`, `force_refresh`.
   - Successful response: `access_token`, `expires_in`.
   - Publisher caches the token in process and refreshes two minutes early.
2. `POST /cgi-bin/media/uploadimg?access_token=...`
   - Multipart field: `media`.
   - Successful response: a WeChat-hosted body image `url`.
3. `POST /cgi-bin/material/add_material?access_token=...&type=image`
   - Multipart field: `media`.
   - Successful response: permanent image `media_id` for
     `thumb_media_id`.
4. `POST /cgi-bin/draft/add?access_token=...`
   - JSON body: `articles[]` with `title`, `author`, `digest`, `content`,
     `content_source_url`, `thumb_media_id`, `show_cover_pic`,
     `need_open_comment`, and `only_fans_can_comment`.

Publisher contains no `freepublish` API implementation.

## Probe checklist

The following evidence must be added with secrets and tokens redacted:

- [ ] Target account can obtain `access_token`.
- [ ] Publisher egress IP is accepted by the WeChat allowlist.
- [ ] `media/uploadimg` accepts the intended PNG/JPEG inputs.
- [ ] `material/add_material` returns a usable cover `media_id`.
- [ ] `draft/add` creates a draft visible in the target backend.
- [ ] Record accepted MIME types and measured body-image maximum bytes.
- [ ] Record accepted cover MIME types, dimensions, and maximum bytes.
- [ ] Record maximum accepted article HTML bytes.
- [ ] Record observed `expires_in` and token-related error codes.
- [ ] Record no-permission, invalid-media, and invalid-format error shapes.

## Temporary local limits

`DOCMOST_MAX_ASSET_BYTES` and `WECHAT_MAX_IMAGE_BYTES` are configurable safety
ceilings, not claims about WeChat's limits. The `.env.example` values are
conservative placeholders and must be replaced with probe evidence.

## Official documentation

- Stable token:
  https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/getStableAccessToken.html
- Add draft:
  https://developers.weixin.qq.com/doc/subscription/api/draftbox/draftmanage/api_draft_add.html
- Asset management:
  https://developers.weixin.qq.com/doc/offiaccount/Asset_Management/Adding_Permanent_Assets.html

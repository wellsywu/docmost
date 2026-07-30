# Publisher Connector

Independent Docmost-to-WeChat draft service for DOCMOST-18.

Copy `.env.example` to the repository root `.env` and keep `WECHAT_MODE=mock`
until an account and an IP allowlist are ready. WeChat AppID/AppSecret values
are never configured on the Publisher process.

```bash
pnpm --filter publisher test
pnpm --filter publisher build
pnpm --filter publisher migration:up
pnpm --filter publisher start
```

Open `http://127.0.0.1:3050`. The console accepts a Docmost page UUID, an
explicit account selection, and publishing metadata. It never receives or
returns Docmost or WeChat secrets.

## Entry point inside Docmost

The Docmost page action now opens the bundled doocs/md editor through
`MD_EDITOR_URL` and a one-time ticket. Publisher remains an optional draft API
connector and exposes its own console at port 3050 when the `publisher` compose
profile is enabled; `PUBLISHER_URL` is retained only for older deployments.

API authentication is on by default (`PUBLISHER_AUTH_ENABLED=1`), so the console
needs the `PUBLISHER_ACCESS_TOKEN` value in its first field. Set
`PUBLISHER_AUTH_ENABLED=0` only for local mock runs; live mode refuses to start
without it.

`PUBLISHER_DATABASE_URL` must point at the integration database that contains
the `wechat_accounts` rows managed by Docmost. In live mode set
`INTEGRATION_ENCRYPTION_SECRET` to the exact same value as Docmost
`APP_SECRET`; `APP_SECRET` is accepted as an alias. Publisher reads the selected
row and decrypts `app_secret_enc` in-process for that request. It never returns
or logs AppID, AppSecret, encrypted envelopes, or access tokens.

Migrations only require `PUBLISHER_DATABASE_URL`. To include the real
PostgreSQL store test in the test suite, set `PUBLISHER_TEST_DATABASE_URL` to an
isolated migrated database. Without it, that one integration test is skipped.

## Layout

```
src/
  app.ts             Fastify wiring and routes
  config.ts          environment schema and live-mode guards
  core/              hashing, shared types, HTML escaping
  docmost/           page reads and ProseMirror node validation
  rendering/         Markdown -> WeChat HTML (theme, footnotes, blocks, mermaid)
  media/             rasterizing, WeChat image rules, cover handling, uploads
  wechat/            port, mock adapter, live adapter
  publication/       publication service and store
  database/          Kysely migrations and typed access
test/                one file per area, `helpers.ts` holds shared fixtures
```

## Rendering rules

The renderer targets what WeChat's article body actually keeps:

- external links become numbered references plus a reference list, because
  WeChat drops anchors that do not point at its own domains;
- syntax colours, callouts, collapsible blocks and formulas are all inlined as
  `style` attributes, because class based CSS is stripped;
- Mermaid diagrams and SVG images are rasterized to PNG;
- body images must be PNG or JPEG, and the first one becomes the cover unless
  `PUBLISHER_DEFAULT_COVER_PATH` is set;
- Docmost nodes that its Markdown export cannot represent (drawio, excalidraw,
  transclusion, mentions, embeds) block the publication instead of silently
  producing an incomplete draft.

`PUBLISHER_TEMPLATE_VERSION` defaults to a template id derived from the
stylesheet, and it participates in the publication idempotency key, so a
template change no longer reuses an old draft.

## Docker

```bash
docker compose --profile publisher up -d
```

The `publisher` profile adds the connector without exposing any WeChat
credentials as container environment variables. Before switching
`WECHAT_MODE` to `live`, point it at the shared integration database and set
the matching integration encryption secret.

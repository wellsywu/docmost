# Plan A: Monorepo Publisher

## Architecture

Create an independently deployable TypeScript service under `apps/publisher`.
It exposes a small Fastify API and a server-rendered static console. Core
publishing logic depends on interfaces for Docmost, rendering, persistence,
assets, and WeChat so local tests can use deterministic fakes.

## Delivery sequence

1. Add configuration validation, mock/live WeChat modes, health endpoint, and
   a static console.
2. Add the six Publisher tables, Kysely migrations, generated-style database
   types, partial unique indexes, and migration verification.
3. Read ProseMirror JSON and Markdown through `POST /pages/info`.
4. Scan the ProseMirror tree with an explicit allowlist before rendering.
5. Compute `sourceHash = sha256(markdown)` and an idempotency key from
   `pageId + sourceHash + channel + accountId + templateVersion`.
6. Render Markdown through the pinned doocs renderer adapter, sanitize and
   inline styles, render Mermaid, rasterize SVG to PNG, and transfer assets.
7. Re-read Markdown before draft creation; block only when its hash changed.
8. Upload the first image as cover, create a WeChat draft, and persist only
   metadata, hashes, warnings, asset references, and audit records.
9. Verify unit/integration tests, lint, typecheck, build, and mock end-to-end.

## Success criteria

- Repeating the same publish request returns the existing draft and makes no
  second draft API call.
- A changed body hash blocks a stale publish; an `updatedAt`-only change does
  not.
- Unsupported ProseMirror nodes and invalid Mermaid are explicit blocking
  failures.
- Absolute Docmost URLs plus `/api/files` and `/files` paths are normalized
  safely; credentials never leave the Docmost origin.
- SVG output is PNG and oversized images are retried at lower dimensions.
- No code path calls a WeChat `freepublish` endpoint.
- Live mode cannot start with placeholders.

## Stop condition

The local/mock implementation is complete when all automated checks pass and a
mock draft is created through the console/API. DOCMOST-18 remains In Progress,
with DOCMOST-19 explicitly outstanding, until real WeChat evidence is recorded.

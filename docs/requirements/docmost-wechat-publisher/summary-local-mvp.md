# Local MVP Summary

Plane requirement: DOCMOST-18.

> 后续整改见 [summary-review-fixes.md](./summary-review-fixes.md)。本文档中
> "doocs/md-compatible" 的说法已作废：渲染器为自研实现，仅行为参考 doocs/md。

## Delivered

- Added an independently deployable Publisher Connector under
  `apps/publisher`.
- Added a protected Fastify API and independent web console for configuring and
  starting Docmost-to-WeChat draft jobs, including per-page configuration
  persistence and automatic form refill.
- Added mock and live WeChat adapters. The live adapter creates drafts only and
  has no `freepublish` implementation.
- Added Docmost page and Markdown reads, explicit ProseMirror node validation,
  deterministic source hashes, and atomic idempotency claims.
- Added doocs/md-compatible Markdown rendering, HTML sanitation and CSS
  inlining, Mermaid rendering, SVG-to-PNG rasterization, asset validation,
  bounded image handling, and asset cache reuse.
- Added a Publisher-owned PostgreSQL schema with six tables, UUID v7 support,
  partial unique indexes, rollback migrations, typed access, and redacted audit
  events.
- Added a server-side contract test for the Docmost Markdown and ProseMirror
  export shape, backed by reviewable JSON fixtures and Markdown expected files.
- Added placeholder-only local configuration. Live mode rejects placeholder
  credentials, volatile storage, and a placeholder Publisher access token.

## Verification

- `pnpm --filter publisher test`: 32 tests passed, including the conditional
  real-PostgreSQL integration test.
- `pnpm --filter publisher lint`: passed.
- `pnpm --filter publisher typecheck`: passed.
- `pnpm --filter publisher build`: passed.
- Publisher and requirement-document Prettier check: passed.
- `pnpm --filter server exec jest
src/collaboration/markdown-export-contract.spec.ts --runInBand`: 2 tests
  passed.
- `git diff --check`: passed.
- PostgreSQL 18.4 migration rehearsal: `up -> down -> down -> up` passed; all
  six tables and the `gen_uuid_v7()` compatibility function were created and
  rolled back in the expected order.
- PostgreSQL concurrency rehearsal: 12 simultaneous identical job inserts
  produced one active job; concurrent configuration upserts and replacement
  after soft deletion satisfied the partial unique indexes.
- `kysely-codegen` introspected all six live tables and generated the expected
  `DB` interface in a temporary file.
- Built process smoke test with PostgreSQL persistence: `/health` returned
  `persistence: "postgres"` and the console returned HTTP 200.

The automated tests cover concurrent duplicate requests, stale-source blocking,
updatedAt-only changes, unsupported nodes, Mermaid failures, SVG and Chinese
text rasterization, credential-origin isolation, redirect/MIME/size rejection,
API access control and secret-safe errors, bounded streaming downloads,
per-page configuration refill, legacy `publish-config` redaction, asset cache
reuse, draft-only endpoint mapping, migrations, and audit records.

## Outstanding external evidence

DOCMOST-19 remains blocked until a real certified WeChat service account,
AppID/AppSecret, allowlisted Publisher egress IP, and WeChat backend access are
available. The following acceptance evidence is therefore intentionally not
claimed:

- a real `access_token` request;
- real body-image and cover-material uploads;
- real draft creation;
- visual inspection of the generated draft in the WeChat backend.

## Status recommendation

Keep DOCMOST-18 In Progress. Local implementation and automated verification are
complete, including a real PostgreSQL rehearsal; close the parent only after
DOCMOST-19 records real WeChat acceptance evidence.

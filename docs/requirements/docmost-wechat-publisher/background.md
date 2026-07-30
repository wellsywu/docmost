# Docmost WeChat Publisher

Plane requirement: DOCMOST-18.

## Goal

Build a standalone Publisher Connector inside this monorepo at `apps/publisher`.
It reads a Docmost page through the REST API, validates the ProseMirror tree,
renders deterministic WeChat-safe HTML, transfers all images, and creates a
WeChat Official Account draft for final human review.

## Boundaries

- Docmost remains the only source of page content and is never written to.
- Publisher owns credentials, asset transfer, idempotency, audit, and retry
  state in a separate PostgreSQL database.
- Phase 1 supports one WeChat account and one draft-only channel.
- The first usable body image is the default cover.
- Unknown or unsupported Docmost nodes block publishing; content is never
  silently discarded.
- `freepublish` APIs, browser automation, and Docmost UI changes are excluded.

## Confirmed decisions

- Service location: `apps/publisher` in the existing monorepo.
- Data storage: a Publisher-owned database, separate from Docmost.
- Entry point: independent web console.
- Account scope: single account for the MVP.
- Final publishing: always performed manually in WeChat.
- Credentials: not configured yet. Development uses random-looking placeholders
  and a mock WeChat adapter. Live mode rejects placeholder credentials.

## External blocker

DOCMOST-19 requires a certified WeChat service account, a real AppID/AppSecret,
an allowlisted Publisher egress IP, and access to the WeChat backend. Until
those are supplied, the real `access_token`, image/material upload, draft
creation, and backend visual inspection acceptance cannot be claimed.

## Security invariants

- AppSecret, Docmost API key, and access tokens never appear in URLs, browser
  responses, logs, or database columns.
- Bearer authentication is sent only to the configured Docmost origin.
- Asset downloads reject credentials in URLs, non-HTTP(S) schemes, private or
  loopback destinations outside the configured Docmost origin, redirects to
  untrusted origins, unsupported MIME types, and oversized responses.
- Rendered article HTML is not persisted; only its SHA-256 hash is stored.

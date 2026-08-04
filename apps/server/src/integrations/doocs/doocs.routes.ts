import { RequestMethod } from '@nestjs/common';

/** Base path of every doocs endpoint. */
export const DOOCS_ROUTE_PREFIX = 'integrations/doocs';

/**
 * Routes the doocs SPA calls with only an `mdSession` bearer token — it has no
 * Docmost cookie and no workspace context. They must be skipped by
 * DomainMiddleware / AuditContextMiddleware (core.module.ts) and by the
 * workspaceId preHandler (main.ts).
 *
 * This is the single seam between doocs and Docmost core: adding or removing a
 * doocs endpoint should only ever touch this file.
 *
 * `tickets`, `config` and the account CRUD routes are deliberately absent —
 * those are called by the authenticated Docmost client and do need the
 * workspace context.
 */
const UNSCOPED_ROUTES = [
  'bootstrap',
  'settings',
  'settings/update',
  'content/update',
  'upload',
  'upload/config',
  'sessions/revoke',
] as const;

/** For `MiddlewareConsumer.exclude()` in core.module.ts. */
export const DOOCS_UNSCOPED_ROUTES = UNSCOPED_ROUTES.map((route) => ({
  path: `${DOOCS_ROUTE_PREFIX}/${route}`,
  method: RequestMethod.POST,
}));

/** For the `req.originalUrl.startsWith(...)` check in main.ts. */
export const DOOCS_UNSCOPED_PATHS = UNSCOPED_ROUTES.map(
  (route) => `/api/${DOOCS_ROUTE_PREFIX}/${route}`,
);

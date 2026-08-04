import { RequestMethod } from '@nestjs/common';
import {
  DOOCS_ROUTE_PREFIX,
  DOOCS_UNSCOPED_PATHS,
  DOOCS_UNSCOPED_ROUTES,
} from './doocs.routes';

describe('doocs route scoping contract', () => {
  it('excludes every mdSession-only route from workspace middleware', () => {
    expect(DOOCS_UNSCOPED_ROUTES).toEqual(
      expect.arrayContaining([
        {
          path: `${DOOCS_ROUTE_PREFIX}/bootstrap`,
          method: RequestMethod.POST,
        },
        {
          path: `${DOOCS_ROUTE_PREFIX}/settings`,
          method: RequestMethod.POST,
        },
        {
          path: `${DOOCS_ROUTE_PREFIX}/settings/update`,
          method: RequestMethod.POST,
        },
        {
          path: `${DOOCS_ROUTE_PREFIX}/upload`,
          method: RequestMethod.POST,
        },
        {
          path: `${DOOCS_ROUTE_PREFIX}/upload/config`,
          method: RequestMethod.POST,
        },
        {
          path: `${DOOCS_ROUTE_PREFIX}/sessions/revoke`,
          method: RequestMethod.POST,
        },
      ]),
    );
    expect(DOOCS_UNSCOPED_PATHS).toEqual(
      expect.arrayContaining([
        '/api/integrations/doocs/upload',
        '/api/integrations/doocs/upload/config',
      ]),
    );
  });

  it('keeps authenticated admin routes scoped to the workspace', () => {
    expect(DOOCS_UNSCOPED_PATHS).not.toContain(
      '/api/integrations/doocs/upload-config',
    );
    expect(DOOCS_UNSCOPED_PATHS).not.toContain(
      '/api/integrations/doocs/upload-config/update',
    );
    expect(DOOCS_UNSCOPED_PATHS).not.toContain(
      '/api/integrations/doocs/accounts/list',
    );
  });
});

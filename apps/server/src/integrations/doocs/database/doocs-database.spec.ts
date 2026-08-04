import {
  DoocsDatabaseLifecycle,
  DOOCS_DATABASE,
  DoocsDatabaseModule,
} from './doocs-database.module';
import {
  INTEGRATION_MIGRATION_LOCK_TABLE,
  INTEGRATION_MIGRATION_TABLE,
  integrationMigrationProvider,
} from '@docmost/integration-db';

describe('Doocs integration database', () => {
  it('owns an explicit migration registry and separate migration metadata', async () => {
    await expect(integrationMigrationProvider.getMigrations()).resolves.toEqual(
      {
        '20260730T000000-md-integration': expect.objectContaining({
          up: expect.any(Function),
          down: expect.any(Function),
        }),
        '20260801T000000-doocs-upload-config': expect.objectContaining({
          up: expect.any(Function),
          down: expect.any(Function),
        }),
        '20260802T000000-doocs-publish-assets': expect.objectContaining({
          up: expect.any(Function),
          down: expect.any(Function),
        }),
        '20260803T000000-wechat-account-proxy-origin': expect.objectContaining({
          up: expect.any(Function),
          down: expect.any(Function),
        }),
        '20260804T000000-doocs-publish-url-index': expect.objectContaining({
          up: expect.any(Function),
          down: expect.any(Function),
        }),
      },
    );
    expect(INTEGRATION_MIGRATION_TABLE).toBe('integration_migrations');
    expect(INTEGRATION_MIGRATION_LOCK_TABLE).toBe('integration_migration_lock');
  });

  it('checks connectivity before production startup work', async () => {
    const db = { destroy: jest.fn() };
    const environment = {
      getNodeEnv: jest.fn().mockReturnValue('development'),
    };
    const lifecycle = new DoocsDatabaseLifecycle(
      db as never,
      environment as never,
    );
    jest.spyOn(lifecycle, 'establishConnection').mockResolvedValue(undefined);

    await lifecycle.onApplicationBootstrap();

    expect(lifecycle.establishConnection).toHaveBeenCalledTimes(1);
  });

  it('is exported as its own Nest module/provider boundary', () => {
    expect(DoocsDatabaseModule).toBeDefined();
    expect(typeof DOOCS_DATABASE).toBe('symbol');
  });
});

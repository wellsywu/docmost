import { CollaborationGateway } from './collaboration.gateway';
import { CollabEventHandlers } from './collaboration.handler';
import { RedisSyncExtension } from './extensions/redis-sync';

jest.mock('@hocuspocus/server', () => ({
  Hocuspocus: jest.fn().mockImplementation((configuration) => ({
    configuration,
    getConnectionsCount: jest.fn(),
    getDocumentsCount: jest.fn(),
    handleConnection: jest.fn(),
    openDirectConnection: jest.fn(),
    closeConnections: jest.fn(),
    hooks: jest.fn(),
  })),
}));

jest.mock('./extensions/redis-sync', () => ({
  RedisSyncExtension: jest.fn().mockImplementation(() => ({
    handleEvent: jest.fn(),
    onConfigure: jest.fn(),
    onSocketOpen: jest.fn(),
    onSocketMessage: jest.fn(),
    onSocketClose: jest.fn(),
    lockDocument: jest.fn(),
    releaseLock: jest.fn(),
  })),
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    duplicate: jest.fn(),
  })),
}));

describe('CollaborationGateway', () => {
  const createGateway = (disableRedis: boolean, handlers: CollabEventHandlers) =>
    new CollaborationGateway(
      {} as never,
      {} as never,
      {} as never,
      {
        getRedisUrl: jest.fn().mockReturnValue('redis://localhost:6379'),
        isCollabDisableRedis: jest.fn().mockReturnValue(disableRedis),
      } as never,
      {
        getHandlers: jest.fn().mockReturnValue(handlers),
      } as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles yjs events locally when redis sync is disabled', async () => {
    const updatePageContent = jest.fn().mockResolvedValue('updated');
    const gateway = createGateway(true, {
      updatePageContent,
    } as unknown as CollabEventHandlers);

    await expect(
      gateway.handleYjsEvent('updatePageContent', 'page.page-1', {
        operation: 'replace',
        prosemirrorJson: { type: 'doc' },
        user: { id: 'user-1' },
      } as never),
    ).resolves.toBe('updated');

    expect(updatePageContent).toHaveBeenCalledWith('page.page-1', {
      operation: 'replace',
      prosemirrorJson: { type: 'doc' },
      user: { id: 'user-1' },
    });
  });

  it('keeps routing yjs events through redis sync when enabled', async () => {
    const gateway = createGateway(false, {} as CollabEventHandlers);
    const redisSync = jest.mocked(RedisSyncExtension).mock.results[0].value;

    redisSync.handleEvent.mockResolvedValue('redis-updated');

    await expect(
      gateway.handleYjsEvent('updatePageContent', 'page.page-1', {
        operation: 'replace',
        prosemirrorJson: { type: 'doc' },
        user: { id: 'user-1' },
      } as never),
    ).resolves.toBe('redis-updated');

    expect(redisSync.handleEvent).toHaveBeenCalledWith(
      'updatePageContent',
      'page.page-1',
      {
        operation: 'replace',
        prosemirrorJson: { type: 'doc' },
        user: { id: 'user-1' },
      },
    );
  });
});

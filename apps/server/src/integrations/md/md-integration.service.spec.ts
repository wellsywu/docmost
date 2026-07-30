import { MdIntegrationService } from './md-integration.service';

describe('MdIntegrationService', () => {
  it('bootstraps markdown, safe settings/accounts and never includes a secret', async () => {
    const tickets = {
      consume: jest.fn().mockResolvedValue({
        userId: 'user-1',
        pageId: 'page-1',
      }),
    };
    const sessions = {
      create: jest.fn().mockResolvedValue({
        token: 'md-session-token',
        expiresAt: 123,
      }),
    };
    const settings = {
      list: jest
        .fn()
        .mockResolvedValue([{ key: 'locale', value: 'zh-CN', updatedAt: 1 }]),
    };
    const accounts = {
      list: jest.fn().mockResolvedValue([
        {
          id: 'account-1',
          name: 'Main',
          appId: 'wx-app',
          mpId: null,
          serviceType: null,
          verify: false,
          secretConfigured: true,
        },
      ]),
    };
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'page-1',
        workspaceId: 'workspace-a',
        title: 'Example',
        deletedAt: null,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Safe markdown' }],
            },
          ],
        },
      }),
    };
    const service = new MdIntegrationService(
      tickets as never,
      sessions as never,
      settings as never,
      accounts as never,
      pageRepo as never,
    );

    const result = await service.bootstrap('one-time-ticket');

    expect(result).toEqual(
      expect.objectContaining({
        title: 'Example',
        markdown: expect.stringContaining('Safe markdown'),
        mdSessionToken: 'md-session-token',
        accounts: [
          expect.objectContaining({
            id: 'account-1',
            secretConfigured: true,
          }),
        ],
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /appSecret|app_secret|ciphertext/,
    );
  });
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  DoocsService,
  detectMarkdownRoundtripRisk,
  hashMarkdown,
} from './doocs.service';
import { jsonToMarkdown } from '../../collaboration/collaboration.util';

jest.mock('../../core/page/services/page.service', () => ({
  PageService: class PageService {},
}));

describe('DoocsService', () => {
  function buildService(overrides: Record<string, any> = {}) {
    const deps = {
      tickets: {
        consume: jest.fn().mockResolvedValue({
          userId: 'user-1',
          pageId: 'page-1',
        }),
      },
      sessions: {
        create: jest.fn().mockResolvedValue({
          token: 'md-session-token',
          expiresAt: 123,
        }),
      },
      settings: {
        list: jest
          .fn()
          .mockResolvedValue([{ key: 'locale', value: 'zh-CN', updatedAt: 1 }]),
      },
      accounts: {
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
      },
      uploadConfig: {
        getPublic: jest.fn().mockResolvedValue({ provider: 'wechat' }),
      },
      uploads: {
        resolvePublishUrlsForPage: jest.fn().mockResolvedValue(new Map()),
        findAttachmentsByPublishUrls: jest.fn().mockResolvedValue(new Map()),
      },
      pageRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'page-1',
          workspaceId: 'workspace-a',
          spaceId: 'space-1',
          title: 'Example',
          deletedAt: null,
          updatedAt: new Date('2026-08-01T00:00:00Z'),
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
      },
      pageService: {
        update: jest.fn(),
        updatePageContent: jest.fn(),
        flushPageContent: jest.fn(),
      },
      pageAccessService: {
        validateCanEdit: jest.fn(),
        validateCanViewWithPermissions: jest.fn().mockResolvedValue({
          canEdit: true,
          hasRestriction: false,
        }),
      },
      userRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'user-1',
          workspaceId: 'workspace-a',
          deletedAt: null,
          deactivatedAt: null,
        }),
      },
      ...overrides,
    };

    const service = new DoocsService(
      deps.tickets as never,
      deps.sessions as never,
      deps.settings as never,
      deps.accounts as never,
      deps.uploadConfig as never,
      deps.uploads as never,
      deps.pageRepo as never,
      deps.pageService as never,
      deps.pageAccessService as never,
      deps.userRepo as never,
    );

    return { service, deps };
  }

  it('bootstraps markdown, safe settings/accounts and never includes a secret', async () => {
    const { service } = buildService();

    const result = await service.bootstrap('one-time-ticket');

    expect(result).toEqual(
      expect.objectContaining({
        pageId: 'page-1',
        docmostPagePath: '/p/page-1',
        title: 'Example',
        markdown: expect.stringContaining('Safe markdown'),
        canEdit: true,
        updatedAt: new Date('2026-08-01T00:00:00Z').getTime(),
        contentHash: hashMarkdown('Safe markdown'),
        roundtripRisk: {
          hasUnsupportedNodes: false,
          unsupportedNodeTypes: [],
        },
        mdSessionToken: 'md-session-token',
        uploadProvider: 'wechat',
        uploadConfig: { provider: 'wechat' },
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

  it('updates the session page with an empty markdown replacement', async () => {
    const updatedPage = {
      id: 'page-1',
      workspaceId: 'workspace-a',
      title: 'Example',
      deletedAt: null,
      updatedAt: new Date('2026-08-01T00:00:01Z'),
      content: null,
    };
    const loadedPage = {
      id: 'page-1',
      workspaceId: 'workspace-a',
      title: 'Example',
      deletedAt: null,
      updatedAt: new Date('2026-08-01T00:00:00Z'),
      content: null,
    };
    const { service, deps } = buildService();
    deps.pageRepo.findById.mockResolvedValueOnce(loadedPage);
    // Second read is the post-flush one the baseline is taken from.
    deps.pageRepo.findById.mockResolvedValueOnce(loadedPage);
    deps.pageRepo.findById.mockResolvedValueOnce(updatedPage);

    const result = await service.updateContent(
      {
        pageId: 'page-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(),
      },
      {
        markdown: '',
        title: 'Example',
        expectedUpdatedAt: new Date('2026-08-01T00:00:00Z').getTime(),
        expectedContentHash: hashMarkdown(''),
      },
    );

    expect(deps.userRepo.findById).toHaveBeenCalledWith(
      'user-1',
      'workspace-a',
    );
    expect(deps.pageAccessService.validateCanEdit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'page-1' }),
      expect.objectContaining({ id: 'user-1' }),
    );
    expect(deps.pageService.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'page-1' }),
      {
        pageId: 'page-1',
        title: 'Example',
      },
      expect.objectContaining({ id: 'user-1' }),
    );
    expect(deps.pageService.updatePageContent).toHaveBeenCalledWith(
      'page-1',
      expect.objectContaining({ type: 'doc' }),
      'replace',
      'json',
      expect.objectContaining({ id: 'user-1' }),
    );
    expect(result).toEqual({
      title: 'Example',
      markdown: '',
      imageSync: { total: 0, ready: 0, pending: [], failed: [] },
      canEdit: true,
      updatedAt: new Date('2026-08-01T00:00:01Z').getTime(),
      contentHash: hashMarkdown(''),
      roundtripRisk: {
        hasUnsupportedNodes: false,
        unsupportedNodeTypes: [],
      },
    });
  });

  it('reports Markdown roundtrip risk for custom Docmost nodes during bootstrap', async () => {
    const { service } = buildService({
      pageRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'page-1',
          workspaceId: 'workspace-a',
          title: 'Example',
          deletedAt: null,
          updatedAt: new Date('2026-08-01T00:00:00Z'),
          content: { type: 'doc', content: [{ type: 'drawio' }] },
        }),
      },
    });

    await expect(service.bootstrap('ticket')).resolves.toEqual(
      expect.objectContaining({
        roundtripRisk: {
          hasUnsupportedNodes: true,
          unsupportedNodeTypes: ['drawio'],
        },
      }),
    );
  });

  it('blocks risky Markdown replacement until the client acknowledges it', async () => {
    const { service, deps } = buildService({
      pageRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'page-1',
          workspaceId: 'workspace-a',
          title: 'Example',
          deletedAt: null,
          updatedAt: new Date('2026-08-01T00:00:00Z'),
          content: {
            type: 'doc',
            content: [{ type: 'customWidget', attrs: { id: 'one' } }],
          },
        }),
      },
    });

    await expect(
      service.updateContent(
        {
          pageId: 'page-1',
          userId: 'user-1',
          tokenHash: 'hash',
          expiresAt: new Date(),
        },
        {
          markdown: '# Replacement',
          expectedUpdatedAt: new Date('2026-08-01T00:00:00Z').getTime(),
          expectedContentHash: hashMarkdown(''),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(deps.pageService.updatePageContent).not.toHaveBeenCalled();
  });

  it('allows risky Markdown replacement when explicitly acknowledged', async () => {
    const riskyContent = { type: 'doc', content: [{ type: 'drawio' }] };
    const riskyPage = {
      id: 'page-1',
      workspaceId: 'workspace-a',
      title: 'Example',
      deletedAt: null,
      updatedAt: new Date('2026-08-01T00:00:00Z'),
      content: riskyContent,
    };
    const pageRepo = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(riskyPage)
        .mockResolvedValueOnce(riskyPage)
        .mockResolvedValueOnce({
          id: 'page-1',
          workspaceId: 'workspace-a',
          title: 'Example',
          deletedAt: null,
          updatedAt: new Date('2026-08-01T00:00:01Z'),
          content: null,
        }),
    };
    const { service, deps } = buildService({ pageRepo });

    await service.updateContent(
      {
        pageId: 'page-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(),
      },
      {
        markdown: '',
        expectedUpdatedAt: new Date('2026-08-01T00:00:00Z').getTime(),
        expectedContentHash: hashMarkdown(jsonToMarkdown(riskyContent)),
        acknowledgeRoundtripRisk: true,
      },
    );

    expect(deps.pageService.updatePageContent).toHaveBeenCalledWith(
      'page-1',
      expect.objectContaining({ type: 'doc' }),
      'replace',
      'json',
      expect.objectContaining({ id: 'user-1' }),
    );
  });

  describe('image handoff', () => {
    const attachmentId = '0f1d4a1e-6f4d-4a2c-9d0e-2f8e8f7c1a11';
    const attachmentUrl = `/api/files/${attachmentId}/photo.png`;
    const publishUrl = 'https://cdn.example.com/photo.png';

    function pageWithImage(updatedAt = '2026-08-01T00:00:00Z') {
      return {
        id: 'page-1',
        workspaceId: 'workspace-a',
        spaceId: 'space-1',
        title: 'Example',
        deletedAt: null,
        updatedAt: new Date(updatedAt),
        content: {
          type: 'doc',
          content: [
            { type: 'image', attrs: { src: attachmentUrl, attachmentId } },
          ],
        },
      };
    }

    it('hands the editor publish urls while the baseline stays on the docmost urls', async () => {
      const page = pageWithImage();
      const { service, deps } = buildService({
        pageRepo: { findById: jest.fn().mockResolvedValue(page) },
      });
      deps.uploads.resolvePublishUrlsForPage.mockResolvedValue(
        new Map([
          [
            attachmentId,
            {
              attachmentId,
              provider: 'wechat',
              status: 'ready',
              url: publishUrl,
              retryable: false,
            },
          ],
        ]),
      );

      const result = await service.bootstrap('ticket');

      expect(result.markdown).toContain(publishUrl);
      expect(result.markdown).not.toContain('/api/files/');
      expect(result.imageSync).toEqual({
        total: 1,
        ready: 1,
        pending: [],
        failed: [],
      });
      expect(result.contentHash).toBe(
        hashMarkdown(jsonToMarkdown(page.content)),
      );
      expect(deps.uploads.resolvePublishUrlsForPage).toHaveBeenCalledWith({
        page: {
          id: 'page-1',
          spaceId: 'space-1',
          workspaceId: 'workspace-a',
        },
        attachmentIds: [attachmentId],
        accountId: 'account-1',
      });
    });

    it('keeps the docmost url and reports the failure when publishing fails', async () => {
      const { service, deps } = buildService({
        pageRepo: { findById: jest.fn().mockResolvedValue(pageWithImage()) },
      });
      deps.uploads.resolvePublishUrlsForPage.mockResolvedValue(
        new Map([
          [
            attachmentId,
            {
              attachmentId,
              provider: 'wechat',
              status: 'failed',
              error: 'WeChat rejected the upload',
              retryable: true,
            },
          ],
        ]),
      );

      const result = await service.bootstrap('ticket');

      expect(result.markdown).toContain(attachmentUrl);
      expect(result.imageSync).toEqual({
        total: 1,
        ready: 0,
        pending: [],
        failed: [{ attachmentId, error: 'WeChat rejected the upload' }],
      });
    });

    it('leaves images pending when wechat has no single obvious account', async () => {
      const { service, deps } = buildService({
        pageRepo: { findById: jest.fn().mockResolvedValue(pageWithImage()) },
        accounts: {
          list: jest
            .fn()
            .mockResolvedValue([{ id: 'account-1' }, { id: 'account-2' }]),
        },
      });

      const result = await service.bootstrap('ticket');

      expect(result.markdown).toContain(attachmentUrl);
      expect(result.imageSync).toEqual({
        total: 1,
        ready: 0,
        pending: [attachmentId],
        failed: [],
      });
      expect(deps.uploads.resolvePublishUrlsForPage).not.toHaveBeenCalled();
    });

    it('leaves an image from another page alone instead of asking the editor to publish it', async () => {
      const { service, deps } = buildService({
        pageRepo: { findById: jest.fn().mockResolvedValue(pageWithImage()) },
      });
      deps.uploads.resolvePublishUrlsForPage.mockResolvedValue(new Map());

      const result = await service.bootstrap('ticket');

      expect(result.markdown).toContain(attachmentUrl);
      expect(result.imageSync).toEqual({
        total: 1,
        ready: 0,
        pending: [],
        failed: [],
      });
    });

    it('restores publish urls to docmost attachment urls before writing back', async () => {
      const page = pageWithImage();
      const { service, deps } = buildService({
        pageRepo: {
          findById: jest
            .fn()
            .mockResolvedValueOnce(page)
            .mockResolvedValueOnce(page)
            .mockResolvedValueOnce(pageWithImage('2026-08-01T00:00:01Z')),
        },
      });
      deps.uploads.findAttachmentsByPublishUrls.mockResolvedValue(
        new Map([
          [
            'cdn.example.com/photo.png',
            { attachmentId, fileName: 'photo.png' },
          ],
        ]),
      );

      await service.updateContent(
        {
          pageId: 'page-1',
          userId: 'user-1',
          tokenHash: 'hash',
          expiresAt: new Date(),
        },
        {
          markdown: `![](${publishUrl})\n\n![](https://example.com/external.png)`,
          expectedUpdatedAt: new Date('2026-08-01T00:00:00Z').getTime(),
          expectedContentHash: hashMarkdown(jsonToMarkdown(page.content)),
        },
      );

      expect(deps.uploads.findAttachmentsByPublishUrls).toHaveBeenCalledWith(
        { id: 'page-1', workspaceId: 'workspace-a' },
        [publishUrl, 'https://example.com/external.png'],
      );
      const written = JSON.stringify(
        deps.pageService.updatePageContent.mock.calls[0][1],
      );
      expect(written).toContain(attachmentUrl);
      expect(written).not.toContain(publishUrl);
      // Third-party images were never Docmost attachments and stay external.
      expect(written).toContain('https://example.com/external.png');
    });
  });

  describe('collaboration flush', () => {
    const bufferedPage = (text: string, updatedAt: string) => ({
      id: 'page-1',
      workspaceId: 'workspace-a',
      spaceId: 'space-1',
      title: 'Example',
      deletedAt: null,
      updatedAt: new Date(updatedAt),
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    });

    it('bootstraps from the flushed row, not the stale one', async () => {
      const { service, deps } = buildService({
        pageRepo: {
          findById: jest
            .fn()
            .mockResolvedValueOnce(
              bufferedPage('Stale', '2026-08-01T00:00:00Z'),
            )
            .mockResolvedValue(bufferedPage('Live', '2026-08-01T00:00:09Z')),
        },
      });

      const result = await service.bootstrap('ticket');

      expect(deps.pageService.flushPageContent).toHaveBeenCalledWith(
        'page-1',
        expect.objectContaining({ id: 'user-1' }),
      );
      expect(result.markdown).toBe('Live');
      expect(result.contentHash).toBe(hashMarkdown('Live'));
      expect(result.updatedAt).toBe(new Date('2026-08-01T00:00:09Z').getTime());
    });

    it('compares the save baseline against the flushed row', async () => {
      const { service, deps } = buildService({
        pageRepo: {
          findById: jest
            .fn()
            .mockResolvedValueOnce(
              bufferedPage('Stale', '2026-08-01T00:00:00Z'),
            )
            .mockResolvedValue(bufferedPage('Live', '2026-08-01T00:00:09Z')),
        },
      });

      // The editor holds the stale baseline, so this save must be refused rather
      // than silently overwriting the edits that were still buffered.
      await expect(
        service.updateContent(
          {
            pageId: 'page-1',
            userId: 'user-1',
            tokenHash: 'hash',
            expiresAt: new Date(),
          },
          {
            markdown: 'Rewritten',
            expectedUpdatedAt: new Date('2026-08-01T00:00:00Z').getTime(),
            expectedContentHash: hashMarkdown('Stale'),
          },
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(deps.pageService.flushPageContent).toHaveBeenCalled();
      expect(deps.pageService.updatePageContent).not.toHaveBeenCalled();
    });

    it('saves when only updatedAt moved and the content is unchanged', async () => {
      const { service, deps } = buildService({
        pageRepo: {
          findById: jest
            .fn()
            .mockResolvedValue(bufferedPage('Same', '2026-08-01T09:00:00Z')),
        },
      });

      // A title edit or a page move bumps updatedAt without touching content;
      // that is not a conflict the user could resolve.
      await service.updateContent(
        {
          pageId: 'page-1',
          userId: 'user-1',
          tokenHash: 'hash',
          expiresAt: new Date(),
        },
        {
          markdown: 'Rewritten',
          expectedUpdatedAt: new Date('2026-08-01T00:00:00Z').getTime(),
          expectedContentHash: hashMarkdown('Same'),
        },
      );

      expect(deps.pageService.updatePageContent).toHaveBeenCalled();
    });
  });

  it('rejects stale save baselines before writing content', async () => {
    const { service, deps } = buildService();

    await expect(
      service.updateContent(
        {
          pageId: 'page-1',
          userId: 'user-1',
          tokenHash: 'hash',
          expiresAt: new Date(),
        },
        {
          markdown: 'changed',
          expectedUpdatedAt: 1,
          expectedContentHash: 'old',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(deps.pageService.updatePageContent).not.toHaveBeenCalled();
  });
});

describe('detectMarkdownRoundtripRisk', () => {
  it('collects custom node types that Markdown cannot safely roundtrip', () => {
    expect(
      detectMarkdownRoundtripRisk({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'safe' }] },
          { type: 'image', attrs: { src: 'https://example.com/safe.png' } },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph' }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph' }],
                  },
                ],
              },
            ],
          },
          { type: 'drawio' },
          { type: 'customWidget' },
        ],
      }),
    ).toEqual({
      hasUnsupportedNodes: true,
      unsupportedNodeTypes: ['customWidget', 'drawio'],
    });
  });
});

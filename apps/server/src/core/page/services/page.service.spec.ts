import { PageService } from './page.service';

jest.mock('../../../collaboration/collaboration.gateway', () => ({
  CollaborationGateway: class CollaborationGateway {},
}));

describe('PageService', () => {
  function createService() {
    const attachmentRepo = {
      findByIds: jest.fn().mockResolvedValue([
        {
          id: '019fabe2-2a4d-7ee9-b9de-1c4dfbed0001',
          pageId: 'page-1',
          workspaceId: 'workspace-a',
          fileSize: 42,
          deletedAt: null,
        },
      ]),
    };
    const collaborationGateway = {
      handleYjsEvent: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PageService(
      {} as never,
      {} as never,
      attachmentRepo as never,
      {} as never,
      {} as never,
      { add: jest.fn() } as never,
      { add: jest.fn() } as never,
      { add: jest.fn() } as never,
      {} as never,
      collaborationGateway as never,
      {} as never,
      {} as never,
    );

    return { service, attachmentRepo, collaborationGateway };
  }

  it('restores Docmost attachment identity when Doocs saves Markdown image URLs', async () => {
    const { service, attachmentRepo, collaborationGateway } = createService();
    const user = { id: 'user-1', workspaceId: 'workspace-a' };

    await service.updatePageContent(
      'page-1',
      '![cat](/api/files/019fabe2-2a4d-7ee9-b9de-1c4dfbed0001/cat.png)',
      'replace',
      'markdown',
      user as never,
    );

    expect(attachmentRepo.findByIds).toHaveBeenCalledWith([
      '019fabe2-2a4d-7ee9-b9de-1c4dfbed0001',
    ]);
    expect(collaborationGateway.handleYjsEvent).toHaveBeenCalledWith(
      'updatePageContent',
      'page.page-1',
      expect.objectContaining({
        operation: 'replace',
        user,
      }),
    );

    const payload = collaborationGateway.handleYjsEvent.mock.calls[0][2];
    const image = findNodeByType(payload.prosemirrorJson, 'image');
    expect(image).toEqual(
      expect.objectContaining({
        type: 'image',
        attrs: expect.objectContaining({
          src: '/api/files/019fabe2-2a4d-7ee9-b9de-1c4dfbed0001/cat.png',
          attachmentId: '019fabe2-2a4d-7ee9-b9de-1c4dfbed0001',
          size: 42,
        }),
      }),
    );
  });

  it('does not restore an attachment from another page or workspace', async () => {
    const { service, attachmentRepo, collaborationGateway } = createService();
    attachmentRepo.findByIds.mockResolvedValue([
      {
        id: '019fabe2-2a4d-7ee9-b9de-1c4dfbed0001',
        pageId: 'foreign-page',
        workspaceId: 'workspace-a',
        fileSize: 42,
        deletedAt: null,
      },
    ]);

    await service.updatePageContent(
      'page-1',
      '![cat](/api/files/019fabe2-2a4d-7ee9-b9de-1c4dfbed0001/cat.png)',
      'replace',
      'markdown',
      { id: 'user-1', workspaceId: 'workspace-a' } as never,
    );

    const payload = collaborationGateway.handleYjsEvent.mock.calls[0][2];
    const image = findNodeByType(payload.prosemirrorJson, 'image');
    expect(image.attrs.attachmentId).toBeUndefined();
  });
});

function findNodeByType(node: any, type: string): any {
  if (node?.type === type) {
    return node;
  }
  for (const child of node?.content ?? []) {
    const match = findNodeByType(child, type);
    if (match) {
      return match;
    }
  }
  return null;
}

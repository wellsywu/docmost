import { CollaborationHandler } from './collaboration.handler';

describe('CollaborationHandler flushPageContent', () => {
  const user = { id: 'user-1' } as never;

  const buildHocuspocus = (document?: unknown) => ({
    documents: new Map(document ? [['page.page-1', document]] : []),
    storeDocumentHooks: jest.fn().mockResolvedValue(undefined),
  });

  const buildDocument = (connections: { context: unknown }[] = []) => ({
    name: 'page.page-1',
    getConnections: () => connections,
    getConnectionsCount: () => connections.length,
  });

  it('does nothing when the document is not loaded on this instance', async () => {
    const hocuspocus = buildHocuspocus();
    const handlers = new CollaborationHandler().getHandlers(
      hocuspocus as never,
    );

    await handlers.flushPageContent('page.page-1', { user });

    expect(hocuspocus.storeDocumentHooks).not.toHaveBeenCalled();
  });

  it('stores immediately so a following read sees the live document', async () => {
    const document = buildDocument();
    const hocuspocus = buildHocuspocus(document);
    const handlers = new CollaborationHandler().getHandlers(
      hocuspocus as never,
    );

    await handlers.flushPageContent('page.page-1', { user });

    expect(hocuspocus.storeDocumentHooks).toHaveBeenCalledWith(
      document,
      expect.objectContaining({
        document,
        documentName: 'page.page-1',
        context: { user },
      }),
      true,
    );
  });

  it('keeps a live connection as the store context', async () => {
    const editor = { id: 'user-2' };
    const document = buildDocument([{ context: { user: editor } }]);
    const hocuspocus = buildHocuspocus(document);
    const handlers = new CollaborationHandler().getHandlers(
      hocuspocus as never,
    );

    await handlers.flushPageContent('page.page-1', { user });

    // The buffered changes were typed by whoever is connected, so they must stay
    // the page's lastUpdatedBy — not whoever triggered the flush.
    expect(hocuspocus.storeDocumentHooks).toHaveBeenCalledWith(
      document,
      expect.objectContaining({ context: { user: editor } }),
      true,
    );
  });
});

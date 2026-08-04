import { DoocsUploadService } from './doocs-upload.service';

const attachmentId = '11111111-1111-7111-8111-111111111111';
const foreignAttachmentId = '22222222-2222-7222-8222-222222222222';
const page = { id: 'page-1', spaceId: 'space-1', workspaceId: 'workspace-a' };
const s3Config = {
  endpoint: null,
  region: 'auto',
  bucket: 'assets',
  accessKeyId: 'key',
  accessKeySecret: 'secret',
  path: null,
  cdnHost: null,
  pathStyle: false,
};

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    id: attachmentId,
    fileName: 'photo.png',
    filePath: 'workspace-a/files/attachment/photo.png',
    fileSize: 10,
    mimeType: 'image/png',
    pageId: 'page-1',
    spaceId: 'space-1',
    workspaceId: 'workspace-a',
    deletedAt: null,
    ...overrides,
  };
}

/** Minimal Kysely-shaped stub: the service only chains select/where/orderBy. */
function selectStub(rows: any[]) {
  const calls: unknown[][] = [];
  const query: any = {
    select: jest.fn(() => query),
    where: jest.fn((...args: unknown[]) => {
      calls.push(args);
      return query;
    }),
    orderBy: jest.fn(() => query),
    executeTakeFirst: jest.fn().mockResolvedValue(rows[0]),
    execute: jest.fn().mockResolvedValue(rows),
  };
  return { query, calls };
}

function createService(options: {
  assetRows?: any[];
  attachments?: any[];
  uploadResult?: Promise<{ url: string }>;
}) {
  const assets = selectStub(options.assetRows ?? []);
  const insert = {
    values: jest.fn(() => insert),
    onConflict: jest.fn(() => insert),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const db = {
    selectFrom: jest.fn(() => assets.query),
    insertInto: jest.fn(() => insert),
  };
  const attachmentRepo = {
    findByIds: jest.fn().mockResolvedValue(options.attachments ?? []),
  };
  const storage = { read: jest.fn().mockResolvedValue(Buffer.from([1, 2, 3])) };
  const uploadConfig = {
    resolve: jest.fn().mockResolvedValue({ provider: 's3', s3: s3Config }),
  };
  const s3 = {
    upload: jest
      .fn()
      .mockReturnValue(
        options.uploadResult ??
          Promise.resolve({ url: 'https://cdn.example.com/photo.png' }),
      ),
  };
  const service = new DoocsUploadService(
    db as never,
    { findById: jest.fn() } as never,
    attachmentRepo as never,
    { uploadPageFileFromBuffer: jest.fn() } as never,
    storage as never,
    { decrypt: jest.fn() } as never,
    { uploadImage: jest.fn() } as never,
    uploadConfig as never,
    s3 as never,
    { getFileUploadSizeLimit: jest.fn().mockReturnValue('50mb') } as never,
    { log: jest.fn() } as never,
  );
  return { service, assets, insert, attachmentRepo, storage, s3 };
}

describe('DoocsUploadService publish handoff', () => {
  describe('resolvePublishUrlsForPage', () => {
    it('reuses a ready mapping without reading storage again', async () => {
      const { service, storage, s3 } = createService({
        assetRows: [{ publish_url: 'https://cdn.example.com/photo.png' }],
        attachments: [attachment()],
      });

      const result = await service.resolvePublishUrlsForPage({
        page,
        attachmentIds: [attachmentId],
      });

      expect(result.get(attachmentId)).toEqual(
        expect.objectContaining({
          status: 'ready',
          url: 'https://cdn.example.com/photo.png',
        }),
      );
      expect(storage.read).not.toHaveBeenCalled();
      expect(s3.upload).not.toHaveBeenCalled();
    });

    it('uploads the attachment when no mapping exists yet', async () => {
      const { service, storage, s3, insert } = createService({
        assetRows: [],
        attachments: [attachment()],
      });

      const result = await service.resolvePublishUrlsForPage({
        page,
        attachmentIds: [attachmentId],
      });

      expect(storage.read).toHaveBeenCalledWith(
        'workspace-a/files/attachment/photo.png',
      );
      expect(s3.upload).toHaveBeenCalled();
      expect(insert.execute).toHaveBeenCalled();
      expect(result.get(attachmentId)).toEqual(
        expect.objectContaining({
          status: 'ready',
          url: 'https://cdn.example.com/photo.png',
        }),
      );
    });

    it('reports a retryable failure instead of throwing when the upload fails', async () => {
      const { service } = createService({
        assetRows: [],
        attachments: [attachment()],
        uploadResult: Promise.reject(new Error('provider down')),
      });

      const result = await service.resolvePublishUrlsForPage({
        page,
        attachmentIds: [attachmentId],
      });

      expect(result.get(attachmentId)).toEqual(
        expect.objectContaining({ status: 'failed', retryable: true }),
      );
    });

    it('ignores attachments that belong to another page', async () => {
      const { service } = createService({
        assetRows: [],
        attachments: [attachment({ pageId: 'page-2' })],
      });

      const result = await service.resolvePublishUrlsForPage({
        page,
        attachmentIds: [attachmentId],
      });

      expect(result.size).toBe(0);
    });
  });

  describe('findAttachmentsByPublishUrls', () => {
    it('maps a publish url back to the page attachment across protocols', async () => {
      const { service, assets } = createService({
        assetRows: [
          {
            attachment_id: attachmentId,
            publish_url: 'http://mmbiz.qpic.cn/photo',
          },
        ],
        attachments: [attachment()],
      });

      const result = await service.findAttachmentsByPublishUrls(page, [
        'https://mmbiz.qpic.cn/photo',
      ]);

      expect(result.get('mmbiz.qpic.cn/photo')).toEqual({
        attachmentId,
        fileName: 'photo.png',
      });
      expect(assets.calls).toEqual(
        expect.arrayContaining([['workspace_id', '=', 'workspace-a']]),
      );
    });

    it('refuses to map a url whose attachment belongs to another page', async () => {
      const { service } = createService({
        assetRows: [
          {
            attachment_id: foreignAttachmentId,
            publish_url: 'https://cdn.example.com/other.png',
          },
        ],
        attachments: [
          attachment({ id: foreignAttachmentId, pageId: 'page-2' }),
        ],
      });

      const result = await service.findAttachmentsByPublishUrls(page, [
        'https://cdn.example.com/other.png',
      ]);

      expect(result.size).toBe(0);
    });

    it('does not query when there is nothing to map', async () => {
      const { service, assets } = createService({});

      const result = await service.findAttachmentsByPublishUrls(page, []);

      expect(result.size).toBe(0);
      expect(assets.query.execute).not.toHaveBeenCalled();
    });
  });
});

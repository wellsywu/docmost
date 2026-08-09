import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Multipart, MultipartFile } from '@fastify/multipart';
import { FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { DoocsUploadService } from './doocs-upload.service';
import { WechatApiException } from './wechat/wechat-api.service';

const envelope = {
  version: 1,
  algorithm: 'aes-256-gcm',
  iv: 'iv',
  ciphertext: 'encrypted',
  authTag: 'tag',
};
const session = {
  tokenHash: 'token-hash',
  pageId: 'page-1',
  userId: 'user-1',
  expiresAt: new Date(Date.now() + 60_000),
};
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);

function field(fieldname: string, value: unknown): Multipart {
  return {
    type: 'field',
    fieldname,
    value,
    mimetype: 'text/plain',
    encoding: '7bit',
    fieldnameTruncated: false,
    valueTruncated: false,
    fields: {},
  };
}

function file(
  mimetype: string,
  content: Buffer,
  fieldname = 'file',
): MultipartFile {
  const stream = Readable.from([content]) as MultipartFile['file'];
  stream.truncated = false;
  return {
    type: 'file',
    fieldname,
    filename: 'image.png',
    encoding: '7bit',
    mimetype,
    fields: {},
    file: stream,
    toBuffer: async () => content,
  };
}

function request(...parts: Multipart[]): FastifyRequest {
  return {
    parts: jest.fn(async function* () {
      for (const part of parts) {
        yield part;
      }
    }),
  } as unknown as FastifyRequest;
}

function selectQuery(result: unknown) {
  const wheres: unknown[][] = [];
  const query = {
    select: jest.fn(() => query),
    where: jest.fn((...args: unknown[]) => {
      wheres.push(args);
      return query;
    }),
    orderBy: jest.fn(() => query),
    executeTakeFirst: jest.fn().mockResolvedValue(result),
  };
  return { query, wheres };
}

function insertQuery() {
  const query = {
    values: jest.fn(() => query),
    onConflict: jest.fn(() => query),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  return query;
}

function createService(options: {
  account?: unknown;
  uploadLimit?: string;
  publishAsset?: unknown;
  provider?: 'wechat' | 's3';
}) {
  const accountSelect = selectQuery(options.account);
  const assetSelect = selectQuery(options.publishAsset);
  const insert = insertQuery();
  const db = {
    selectFrom: jest.fn((table: string) =>
      table === 'wechat_accounts' ? accountSelect.query : assetSelect.query,
    ),
    insertInto: jest.fn().mockReturnValue(insert),
  };
  const pageRepo = {
    findById: jest.fn().mockResolvedValue({
      id: 'page-1',
      spaceId: 'space-1',
      workspaceId: 'workspace-a',
    }),
  };
  const attachmentRepo = {
    findById: jest.fn(),
    findByIds: jest.fn().mockResolvedValue([]),
  };
  const attachment = {
    id: '11111111-1111-7111-8111-111111111111',
    fileName: 'image.png',
    filePath: 'workspace-a/files/attachment/image.png',
    fileSize: png.length,
    mimeType: 'image/png',
    fileExt: '.png',
    type: 'file',
    creatorId: 'user-1',
    pageId: 'page-1',
    spaceId: 'space-1',
    workspaceId: 'workspace-a',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    aiChatId: null,
  };
  const attachmentService = {
    uploadPageFileFromBuffer: jest.fn().mockResolvedValue(attachment),
  };
  const storage = {
    read: jest.fn().mockResolvedValue(png),
  };
  const cipher = {
    decrypt: jest.fn().mockReturnValue('app-secret-sensitive-value'),
  };
  const uploadConfig = {
    resolveForSession: jest
      .fn()
      .mockResolvedValue({ provider: options.provider ?? 'wechat' }),
    resolve: jest
      .fn()
      .mockResolvedValue({ provider: options.provider ?? 'wechat' }),
  };
  const s3 = {
    upload: jest.fn().mockResolvedValue({
      url: 'https://cdn.example.com/docmost/image.png',
    }),
  };
  const environment = {
    getFileUploadSizeLimit: jest
      .fn()
      .mockReturnValue(options.uploadLimit ?? '50mb'),
    getDoocsAttachmentBaseUrl: jest
      .fn()
      .mockReturnValue('https://docmost.example.com'),
  };
  const tokens = {
    generateAttachmentToken: jest.fn().mockResolvedValue('attachment-jwt'),
  };
  const auditService = { log: jest.fn() };
  const service = new DoocsUploadService(
    db as never,
    pageRepo as never,
    attachmentRepo as never,
    attachmentService as never,
    storage as never,
    cipher as never,
    uploadConfig as never,
    s3 as never,
    environment as never,
    tokens as never,
    auditService as never,
  );
  return {
    service,
    wheres: accountSelect.wheres,
    assetWheres: assetSelect.wheres,
    insert,
    pageRepo,
    attachmentRepo,
    attachmentService,
    storage,
    cipher,
    tokens,
    uploadConfig,
    s3,
    auditService,
    attachment,
  };
}

describe('DoocsUploadService', () => {
  it('stores the Docmost attachment and defers the WeChat upload to the browser', async () => {
    const { service, cipher, attachmentService } = createService({
      account: {
        id: 'account-1',
        app_id: 'wx-app-id-sensitive-value',
        app_secret_enc: envelope,
        proxy_origin: null,
      },
    });

    const result = await service.upload(
      request(field('accountId', 'account-1'), file('image/png', png)),
      session,
    );

    // Nothing is decrypted here: the credential only leaves the server through
    // getWechatUploadCredentials, which is audited.
    expect(cipher.decrypt).not.toHaveBeenCalled();
    expect(attachmentService.uploadPageFileFromBuffer).toHaveBeenCalledWith({
      bytes: png,
      fileName: 'image.png',
      mimeType: 'image/png',
      pageId: 'page-1',
      spaceId: 'space-1',
      workspaceId: 'workspace-a',
      userId: 'user-1',
    });
    expect(result).toEqual({
      attachment: {
        id: '11111111-1111-7111-8111-111111111111',
        fileName: 'image.png',
        // Absolute and signed: the editor runs on its own origin, where a
        // relative link resolves to the wrong host and the bearer token that
        // works for the doocs API is not accepted by /api/files/:id.
        url: 'https://docmost.example.com/api/files/public/11111111-1111-7111-8111-111111111111/image.png?jwt=attachment-jwt',
        mimeType: 'image/png',
        fileSize: png.length,
      },
      publishAsset: {
        attachmentId: '11111111-1111-7111-8111-111111111111',
        provider: 'wechat',
        status: 'deferred',
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('wx-app-id-sensitive-value');
    expect(JSON.stringify(result)).not.toContain('app-secret-sensitive-value');
  });

  it('binds the credential lookup to the session page workspace', async () => {
    const { service, wheres, cipher } = createService({
      account: undefined,
    });

    await expect(
      service.getWechatUploadCredentials('foreign-account', session),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(wheres).toEqual([
      ['id', '=', 'foreign-account'],
      ['workspace_id', '=', 'workspace-a'],
    ]);
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });

  it('writes neither target when the current session cannot edit the page', async () => {
    const { service, uploadConfig, attachmentService } = createService({
      account: {
        id: 'account-1',
        app_id: 'wx-app-id',
        app_secret_enc: envelope,
      },
    });
    uploadConfig.resolveForSession.mockRejectedValue(new ForbiddenException());

    await expect(
      service.upload(
        request(field('accountId', 'account-1'), file('image/png', png)),
        session,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(attachmentService.uploadPageFileFromBuffer).not.toHaveBeenCalled();
  });

  it('does not write the publish target when the Docmost attachment fails', async () => {
    const { service, attachmentService, insert } = createService({
      account: {
        id: 'account-1',
        app_id: 'wx-app-id',
        app_secret_enc: envelope,
      },
    });
    attachmentService.uploadPageFileFromBuffer.mockRejectedValue(
      new BadRequestException('storage failed'),
    );

    await expect(
      service.upload(
        request(field('accountId', 'account-1'), file('image/png', png)),
        session,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(insert.values).not.toHaveBeenCalled();
  });

  it.each([
    ['SVG', 'image/svg+xml', Buffer.from('<svg/>')],
    ['arbitrary bytes', 'image/png', Buffer.from('not a png')],
    ['mismatched signature', 'image/jpeg', png],
  ])('rejects %s uploads', async (_label, mime, content) => {
    const { service, pageRepo } = createService({ account: undefined });

    await expect(
      service.upload(
        request(field('accountId', 'account-1'), file(mime, content)),
        session,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pageRepo.findById).not.toHaveBeenCalled();
  });

  it('enforces the lower environment upload limit while streaming', async () => {
    const { service, pageRepo } = createService({
      account: undefined,
      uploadLimit: '8b',
    });

    await expect(
      service.upload(
        request(field('accountId', 'account-1'), file('image/png', png)),
        session,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pageRepo.findById).not.toHaveBeenCalled();
  });

  it('rejects URL fields instead of acting as a remote fetch proxy', async () => {
    const { service, pageRepo } = createService({ account: undefined });

    await expect(
      service.upload(
        request(
          field('accountId', 'account-1'),
          field('url', 'http://127.0.0.1/private'),
        ),
        session,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pageRepo.findById).not.toHaveBeenCalled();
  });

  it('routes to workspace S3 config without requiring a WeChat account', async () => {
    const { service, wheres, cipher, uploadConfig, s3 } = createService({
      account: undefined,
    });
    const s3Config = {
      endpoint: 'https://s3.example.com',
      region: 'auto',
      bucket: 'bucket',
      accessKeyId: 'key',
      accessKeySecret: 'secret',
      path: 'wechat',
      cdnHost: 'https://cdn.example.com',
      pathStyle: true,
    };
    uploadConfig.resolveForSession.mockResolvedValue({
      provider: 's3',
      s3: s3Config,
    });

    const result = await service.upload(
      request(file('image/png', png)),
      session,
    );

    expect(result).toEqual(
      expect.objectContaining({
        attachment: expect.objectContaining({
          url: expect.stringContaining('/api/files/'),
        }),
        publishAsset: {
          attachmentId: '11111111-1111-7111-8111-111111111111',
          provider: 's3',
          status: 'ready',
          url: 'https://cdn.example.com/docmost/image.png',
          retryable: false,
        },
      }),
    );
    expect(s3.upload).toHaveBeenCalledWith(
      s3Config,
      png,
      'image/png',
      'image.png',
    );
    expect(wheres).toEqual([]);
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });

  it('keeps the Docmost attachment and records retryable state when publish fails', async () => {
    const { service, uploadConfig, s3, attachmentService, insert } =
      createService({ account: undefined });
    uploadConfig.resolveForSession.mockResolvedValue({
      provider: 's3',
      s3: { bucket: 'bucket', region: 'auto' },
    });
    s3.upload.mockRejectedValue(new Error('sensitive upstream detail'));

    const result = await service.upload(
      request(file('image/png', png)),
      session,
    );

    expect(attachmentService.uploadPageFileFromBuffer).toHaveBeenCalledTimes(1);
    expect(result.publishAsset).toEqual({
      attachmentId: '11111111-1111-7111-8111-111111111111',
      provider: 's3',
      status: 'failed',
      error: 'Publish asset upload failed. Retry before publishing.',
      retryable: true,
    });
    expect(JSON.stringify(result)).not.toContain('sensitive upstream detail');
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', publish_url: null }),
    );
  });

  it('reports the provider error code without the message it came with', async () => {
    const { service, uploadConfig, s3 } = createService({ account: undefined });
    uploadConfig.resolveForSession.mockResolvedValue({
      provider: 's3',
      s3: { bucket: 'bucket', region: 'auto' },
    });
    s3.upload.mockRejectedValue(
      Object.assign(new Error('AccessDenied for arn:aws:iam::123:user/ci'), {
        errcode: 'AccessDenied',
      }),
    );

    const result = await service.upload(
      request(file('image/png', png)),
      session,
    );

    expect(result.publishAsset).toEqual(
      expect.objectContaining({
        status: 'failed',
        error:
          'Publish asset upload failed (s3 AccessDenied). Retry before publishing.',
        retryable: true,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('arn:aws:iam');
  });

  it('rejects retrying an attachment outside the session page and workspace', async () => {
    const { service, attachmentRepo, storage } = createService({
      account: {
        id: 'account-1',
        app_id: 'wx-app-id',
        app_secret_enc: envelope,
      },
    });
    attachmentRepo.findById.mockResolvedValue({
      id: '22222222-2222-7222-8222-222222222222',
      pageId: 'foreign-page',
      workspaceId: 'workspace-b',
      deletedAt: null,
    });

    await expect(
      service.publishAttachment(
        '22222222-2222-7222-8222-222222222222',
        'account-1',
        session,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(storage.read).not.toHaveBeenCalled();
  });
});

describe('DoocsUploadService browser-side WeChat publishing', () => {
  const account = {
    id: 'account-1',
    app_id: 'wx-app-id',
    app_secret_enc: envelope,
    proxy_origin: 'https://wechat.example.workers.dev',
  };
  const attachmentId = '11111111-1111-7111-8111-111111111111';

  function ownedAttachment(overrides: Record<string, unknown> = {}) {
    return {
      id: attachmentId,
      fileName: 'image.png',
      pageId: 'page-1',
      workspaceId: 'workspace-a',
      deletedAt: null,
      ...overrides,
    };
  }

  it('leaves the WeChat call to the browser instead of uploading during /upload', async () => {
    const { service, storage } = createService({ account });

    const result = await service.upload(
      request(field('accountId', 'account-1'), file('image/png', png)),
      session,
    );

    // Not even read off disk: nothing here can reach the image host.
    expect(storage.read).not.toHaveBeenCalled();
    expect(result.publishAsset).toEqual({
      attachmentId,
      provider: 'wechat',
      status: 'deferred',
      retryable: false,
    });
  });

  it('hands the browser the account credentials it needs to upload', async () => {
    const { service, auditService } = createService({ account });

    const result = await service.getWechatUploadCredentials(
      'account-1',
      session,
    );

    expect(result).toEqual({
      accountId: 'account-1',
      appId: 'wx-app-id',
      appSecret: 'app-secret-sensitive-value',
      proxyOrigin: 'https://wechat.example.workers.dev',
    });
    // The one moment a WeChat credential leaves the server, so it is logged.
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'wechat.upload_credentials_issued',
        resourceId: 'account-1',
      }),
    );
  });

  it('refuses to hand out credentials when the workspace does not publish to WeChat', async () => {
    const { service } = createService({ account, provider: 's3' });

    await expect(
      service.getWechatUploadCredentials('account-1', session),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records what the browser uploaded so the next copy reuses it', async () => {
    const { service, attachmentRepo, insert } = createService({
      account,
    });
    attachmentRepo.findByIds.mockResolvedValue([ownedAttachment()]);

    const result = await service.registerPublishAssets(
      [
        {
          attachmentId,
          url: 'https://mmbiz.qpic.cn/photo',
          mediaId: 'media-1',
        },
      ],
      'account-1',
      session,
    );

    expect(result).toEqual([
      {
        attachmentId,
        provider: 'wechat',
        status: 'ready',
        url: 'https://mmbiz.qpic.cn/photo',
        mediaId: 'media-1',
        retryable: false,
      },
    ]);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment_id: attachmentId,
        publish_url: 'https://mmbiz.qpic.cn/photo',
        status: 'ready',
      }),
    );
  });

  it.each([
    ['a third-party host', 'https://evil.example.com/photo.png'],
    [
      'a host that merely ends in the right words',
      'https://qpic.cn.evil.com/x',
    ],
    ['plain http', 'http://mmbiz.qpic.cn/photo'],
    ['a non-url', 'not-a-url'],
  ])(
    'rejects %s, which would otherwise be claimed as this page attachment on save',
    async (_label, url) => {
      const { service, attachmentRepo, insert } = createService({
        account,
      });
      attachmentRepo.findByIds.mockResolvedValue([ownedAttachment()]);

      await expect(
        service.registerPublishAssets(
          [{ attachmentId, url }],
          'account-1',
          session,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(insert.values).not.toHaveBeenCalled();
    },
  );

  it('refuses to record an attachment that belongs to another page', async () => {
    const { service, attachmentRepo } = createService({
      account,
    });
    attachmentRepo.findByIds.mockResolvedValue([
      ownedAttachment({ pageId: 'page-2' }),
    ]);

    await expect(
      service.registerPublishAssets(
        [{ attachmentId, url: 'https://mmbiz.qpic.cn/photo' }],
        'account-1',
        session,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports which attachments already have an image-host url', async () => {
    const { service, attachmentRepo } = createService({
      account,
      publishAsset: {
        publish_url: 'https://mmbiz.qpic.cn/photo',
        media_id: null,
      },
    });
    attachmentRepo.findByIds.mockResolvedValue([ownedAttachment()]);

    const result = await service.lookupPublishAssets(
      [attachmentId],
      'account-1',
      session,
    );

    expect(result).toEqual([
      {
        attachmentId,
        provider: 'wechat',
        status: 'ready',
        url: 'https://mmbiz.qpic.cn/photo',
        retryable: false,
      },
    ]);
  });

  it('marks an unpublished attachment deferred rather than failed', async () => {
    const { service, attachmentRepo } = createService({
      account,
    });
    attachmentRepo.findByIds.mockResolvedValue([ownedAttachment()]);

    const result = await service.lookupPublishAssets(
      [attachmentId],
      'account-1',
      session,
    );

    expect(result).toEqual([
      {
        attachmentId,
        provider: 'wechat',
        status: 'deferred',
        retryable: false,
      },
    ]);
  });

  it('omits an attachment from another page instead of reporting on it', async () => {
    const { service, attachmentRepo } = createService({
      account,
    });
    attachmentRepo.findByIds.mockResolvedValue([
      ownedAttachment({ workspaceId: 'workspace-b' }),
    ]);

    await expect(
      service.lookupPublishAssets([attachmentId], 'account-1', session),
    ).resolves.toEqual([]);
  });

  const page = { id: 'page-1', spaceId: 'space-1', workspaceId: 'workspace-a' };

  it('reports an unpublished image on the handoff as pending, not broken', async () => {
    const { service, attachmentRepo, storage } = createService({ account });
    attachmentRepo.findByIds.mockResolvedValue([ownedAttachment()]);

    const result = await service.resolvePublishUrlsForPage({
      page,
      attachmentIds: [attachmentId],
      accountId: 'account-1',
    });

    // There is no WeChat upload target any more, and treating its absence as an
    // error would show every waiting image as failed the moment a page opens.
    expect(result.get(attachmentId)).toEqual({
      attachmentId,
      provider: 'wechat',
      status: 'deferred',
      retryable: false,
    });
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('reuses the image-host url the browser already recorded', async () => {
    const { service, attachmentRepo } = createService({
      account,
      publishAsset: {
        publish_url: 'https://mmbiz.qpic.cn/photo',
        media_id: 'media-1',
      },
    });
    attachmentRepo.findByIds.mockResolvedValue([ownedAttachment()]);

    const result = await service.resolvePublishUrlsForPage({
      page,
      attachmentIds: [attachmentId],
      accountId: 'account-1',
    });

    expect(result.get(attachmentId)).toEqual({
      attachmentId,
      provider: 'wechat',
      status: 'ready',
      url: 'https://mmbiz.qpic.cn/photo',
      mediaId: 'media-1',
      retryable: false,
    });
  });

  it('answers an older editor build with a status instead of refusing outright', async () => {
    const { service, attachmentRepo, storage } = createService({ account });
    attachmentRepo.findById.mockResolvedValue(ownedAttachment());

    // Pre-Plan-B clients still call this; it must not become a 400 they cannot
    // act on, and it must never try to reach WeChat from here.
    await expect(
      service.publishAttachment(attachmentId, 'account-1', session),
    ).resolves.toEqual({
      attachmentId,
      provider: 'wechat',
      status: 'deferred',
      retryable: false,
    });
    expect(storage.read).not.toHaveBeenCalled();
  });
});

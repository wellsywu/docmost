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
  const wechat = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://mmbiz.qpic.cn/safe-image',
    }),
  };
  const uploadConfig = {
    resolveForSession: jest.fn().mockResolvedValue({ provider: 'wechat' }),
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
  };
  const auditService = { log: jest.fn() };
  const service = new DoocsUploadService(
    db as never,
    pageRepo as never,
    attachmentRepo as never,
    attachmentService as never,
    storage as never,
    cipher as never,
    wechat as never,
    uploadConfig as never,
    s3 as never,
    environment as never,
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
    wechat,
    uploadConfig,
    s3,
    auditService,
    attachment,
  };
}

describe('DoocsUploadService', () => {
  it('binds the account lookup to the session page workspace', async () => {
    const { service, wheres, cipher, wechat, attachmentService } =
      createService({
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

    expect(wheres).toEqual([
      ['id', '=', 'account-1'],
      ['workspace_id', '=', 'workspace-a'],
    ]);
    expect(cipher.decrypt).toHaveBeenCalledWith(envelope);
    expect(wechat.uploadImage).toHaveBeenCalledWith(
      {
        accountId: 'account-1',
        appId: 'wx-app-id-sensitive-value',
        appSecret: 'app-secret-sensitive-value',
        proxyOrigin: null,
      },
      png,
      'image/png',
      'image.png',
    );
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
        url: '/api/files/11111111-1111-7111-8111-111111111111/image.png',
        mimeType: 'image/png',
        fileSize: png.length,
      },
      publishAsset: {
        attachmentId: '11111111-1111-7111-8111-111111111111',
        provider: 'wechat',
        status: 'ready',
        url: 'https://mmbiz.qpic.cn/safe-image',
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('wx-app-id-sensitive-value');
    expect(JSON.stringify(result)).not.toContain('app-secret-sensitive-value');
  });

  it('routes the upload through the account proxy origin when one is set', async () => {
    const { service, wechat } = createService({
      account: {
        id: 'account-1',
        app_id: 'wx-app-id',
        app_secret_enc: envelope,
        proxy_origin: 'https://wechat.example.workers.dev',
      },
    });

    await service.upload(
      request(field('accountId', 'account-1'), file('image/png', png)),
      session,
    );

    expect(wechat.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        proxyOrigin: 'https://wechat.example.workers.dev',
      }),
      png,
      'image/png',
      'image.png',
    );
  });

  it('rejects an account from another workspace before decrypting it', async () => {
    const { service, wheres, cipher, wechat, attachmentService } =
      createService({
        account: undefined,
      });

    await expect(
      service.upload(
        request(field('accountId', 'foreign-account'), file('image/png', png)),
        session,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(wheres).toContainEqual(['workspace_id', '=', 'workspace-a']);
    expect(cipher.decrypt).not.toHaveBeenCalled();
    expect(wechat.uploadImage).not.toHaveBeenCalled();
    expect(attachmentService.uploadPageFileFromBuffer).not.toHaveBeenCalled();
  });

  it('writes neither target when the current session cannot edit the page', async () => {
    const { service, uploadConfig, attachmentService, wechat } = createService({
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
    expect(wechat.uploadImage).not.toHaveBeenCalled();
  });

  it('does not write the publish target when the Docmost attachment fails', async () => {
    const { service, attachmentService, wechat, insert } = createService({
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

    expect(wechat.uploadImage).not.toHaveBeenCalled();
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
    const { service, wheres, cipher, wechat, uploadConfig, s3 } = createService(
      {
        account: undefined,
      },
    );
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
    expect(wechat.uploadImage).not.toHaveBeenCalled();
  });

  it('keeps the Docmost attachment and records retryable state when publish fails', async () => {
    const { service, wechat, attachmentService, insert } = createService({
      account: {
        id: 'account-1',
        app_id: 'wx-app-id',
        app_secret_enc: envelope,
      },
    });
    wechat.uploadImage.mockRejectedValue(
      new Error('sensitive upstream detail'),
    );

    const result = await service.upload(
      request(field('accountId', 'account-1'), file('image/png', png)),
      session,
    );

    expect(attachmentService.uploadPageFileFromBuffer).toHaveBeenCalledTimes(1);
    expect(result.publishAsset).toEqual({
      attachmentId: '11111111-1111-7111-8111-111111111111',
      provider: 'wechat',
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
    const { service, wechat } = createService({
      account: {
        id: 'account-1',
        app_id: 'wx-app-id',
        app_secret_enc: envelope,
      },
    });
    wechat.uploadImage.mockRejectedValue(
      new WechatApiException(
        40164,
        'WeChat request failed (40164): invalid ip 203.0.113.7',
      ),
    );

    const result = await service.upload(
      request(field('accountId', 'account-1'), file('image/png', png)),
      session,
    );

    expect(result.publishAsset).toEqual(
      expect.objectContaining({
        status: 'failed',
        error:
          'Publish asset upload failed (wechat 40164). Retry before publishing.',
        retryable: true,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('203.0.113.7');
  });

  it('rejects retrying an attachment outside the session page and workspace', async () => {
    const { service, attachmentRepo, storage, wechat } = createService({
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
    expect(wechat.uploadImage).not.toHaveBeenCalled();
  });
});

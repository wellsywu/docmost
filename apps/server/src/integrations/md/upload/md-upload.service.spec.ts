import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Multipart, MultipartFile } from '@fastify/multipart';
import { FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { MdUploadService } from './md-upload.service';

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

function createService(options: { account?: unknown; uploadLimit?: string }) {
  const { query, wheres } = selectQuery(options.account);
  const db = { selectFrom: jest.fn().mockReturnValue(query) };
  const pageRepo = {
    findById: jest.fn().mockResolvedValue({
      id: 'page-1',
      workspaceId: 'workspace-a',
    }),
  };
  const cipher = {
    decrypt: jest.fn().mockReturnValue('app-secret-sensitive-value'),
  };
  const wechat = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://mmbiz.qpic.cn/safe-image',
    }),
  };
  const environment = {
    getFileUploadSizeLimit: jest
      .fn()
      .mockReturnValue(options.uploadLimit ?? '50mb'),
  };
  const service = new MdUploadService(
    db as never,
    pageRepo as never,
    cipher as never,
    wechat as never,
    environment as never,
  );
  return { service, wheres, pageRepo, cipher, wechat };
}

describe('MdUploadService', () => {
  it('binds the account lookup to the session page workspace', async () => {
    const { service, wheres, cipher, wechat } = createService({
      account: {
        id: 'account-1',
        app_id: 'wx-app-id-sensitive-value',
        app_secret_enc: envelope,
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
      },
      png,
      'image/png',
      'image.png',
    );
    expect(result).toEqual({ url: 'https://mmbiz.qpic.cn/safe-image' });
    expect(JSON.stringify(result)).not.toContain('wx-app-id-sensitive-value');
    expect(JSON.stringify(result)).not.toContain('app-secret-sensitive-value');
  });

  it('rejects an account from another workspace before decrypting it', async () => {
    const { service, wheres, cipher, wechat } = createService({
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
});

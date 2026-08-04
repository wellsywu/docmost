import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DoocsUploadConfigService } from './doocs-upload-config.service';

const envelope = {
  version: 1,
  algorithm: 'aes-256-gcm',
  iv: 'iv',
  ciphertext: 'encrypted-secret',
  authTag: 'tag',
};

function createDb(existing?: unknown) {
  const selectQuery = {
    selectAll: jest.fn(() => selectQuery),
    where: jest.fn(() => selectQuery),
    executeTakeFirst: jest.fn().mockResolvedValue(existing),
  };
  const insertQuery = {
    values: jest.fn(() => insertQuery),
    onConflict: jest.fn((callback: (oc: unknown) => unknown) => {
      callback({
        column: jest.fn(() => ({
          doUpdateSet: jest.fn(),
        })),
      });
      return insertQuery;
    }),
    returningAll: jest.fn(() => insertQuery),
    executeTakeFirstOrThrow: jest.fn(async () => {
      const values = insertQuery.values.mock.calls[0][0];
      return {
        ...values,
        workspace_id: values.workspace_id,
      };
    }),
  };
  const db = {
    selectFrom: jest.fn(() => selectQuery),
    insertInto: jest.fn(() => insertQuery),
  };
  return { db, selectQuery, insertQuery };
}

function createService(existing?: unknown) {
  const { db, insertQuery } = createDb(existing);
  const pageRepo = {
    findById: jest.fn().mockResolvedValue({
      id: 'page-1',
      workspaceId: 'workspace-a',
      deletedAt: null,
    }),
  };
  const cipher = {
    encrypt: jest.fn().mockReturnValue(envelope),
    decrypt: jest.fn().mockReturnValue('s3-secret'),
  };
  const pageAccessService = {
    validateCanEdit: jest.fn(),
  };
  const userRepo = {
    findById: jest.fn().mockResolvedValue({
      id: 'user-1',
      workspaceId: 'workspace-a',
      deletedAt: null,
      deactivatedAt: null,
    }),
  };
  return {
    service: new DoocsUploadConfigService(
      db as never,
      pageRepo as never,
      cipher as never,
      pageAccessService as never,
      userRepo as never,
    ),
    db,
    insertQuery,
    cipher,
    pageAccessService,
    userRepo,
  };
}

describe('DoocsUploadConfigService', () => {
  it('defaults to WeChat and never exposes stored S3 secrets', async () => {
    const { service } = createService({
      workspace_id: 'workspace-a',
      provider: 's3',
      s3_config: {
        endpoint: 'https://s3.example.com',
        region: 'auto',
        bucket: 'bucket',
        accessKeyId: 'access-key',
        path: 'docmost',
        cdnHost: 'https://cdn.example.com',
        pathStyle: true,
      },
      s3_access_key_secret_enc: envelope,
    });

    await expect(service.getPublic('workspace-a')).resolves.toEqual({
      provider: 's3',
      s3: expect.objectContaining({
        endpoint: 'https://s3.example.com',
        cdnHost: 'https://cdn.example.com',
        secretConfigured: true,
      }),
    });
    expect(
      JSON.stringify(await service.getPublic('workspace-a')),
    ).not.toContain('encrypted-secret');
  });

  it('requires an S3 secret during first setup', async () => {
    const { service, insertQuery } = createService();

    await expect(
      service.update('workspace-a', 'user-1', {
        provider: 's3',
        s3: {
          endpoint: 'https://s3.example.com',
          region: 'auto',
          bucket: 'bucket',
          accessKeyId: 'access-key',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(insertQuery.values).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS public S3 endpoints and CDN hosts', async () => {
    const { service } = createService();
    const base = {
      provider: 's3' as const,
      s3: {
        region: 'auto',
        bucket: 'bucket',
        accessKeyId: 'access-key',
        accessKeySecret: 'secret',
      },
    };

    await expect(
      service.update('workspace-a', 'user-1', {
        ...base,
        s3: { ...base.s3, endpoint: 'http://s3.example.com' },
      }),
    ).rejects.toThrow('S3 endpoint must use HTTPS');
    await expect(
      service.update('workspace-a', 'user-1', {
        ...base,
        s3: { ...base.s3, cdnHost: 'http://cdn.example.com' },
      }),
    ).rejects.toThrow('S3 CDN host must use HTTPS');
  });

  it('preserves the existing S3 secret when updating non-secret fields', async () => {
    const { service, cipher } = createService({
      workspace_id: 'workspace-a',
      provider: 's3',
      s3_config: {
        endpoint: 'https://old.example.com',
        region: 'auto',
        bucket: 'old',
        accessKeyId: 'old-key',
        path: null,
        cdnHost: null,
        pathStyle: false,
      },
      s3_access_key_secret_enc: envelope,
    });

    await expect(
      service.update('workspace-a', 'user-1', {
        provider: 's3',
        s3: {
          endpoint: 's3.example.com',
          region: 'auto',
          bucket: 'bucket',
          accessKeyId: 'access-key',
          path: '/docmost/wechat/',
        },
      }),
    ).resolves.toEqual({
      provider: 's3',
      s3: expect.objectContaining({
        endpoint: 'https://s3.example.com',
        path: 'docmost/wechat',
        secretConfigured: true,
      }),
    });
    expect(cipher.encrypt).not.toHaveBeenCalled();
  });

  it('requires edit permission before exposing session upload config', async () => {
    const { service, pageAccessService } = createService({
      workspace_id: 'workspace-a',
      provider: 's3',
      s3_config: {
        endpoint: 'https://s3.example.com',
        region: 'auto',
        bucket: 'bucket',
        accessKeyId: 'access-key',
        path: null,
        cdnHost: null,
        pathStyle: false,
      },
      s3_access_key_secret_enc: envelope,
    });
    pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.getPublicForSession({
        tokenHash: 'hash',
        pageId: 'page-1',
        userId: 'user-1',
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

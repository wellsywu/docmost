import { NotFoundException } from '@nestjs/common';
import { WechatAccountService } from './wechat-account.service';

const envelope = {
  version: 1,
  algorithm: 'aes-256-gcm',
  iv: 'iv',
  ciphertext: 'encrypted',
  authTag: 'tag',
};

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'account-1',
    workspace_id: 'workspace-a',
    name: 'Main account',
    app_id: 'wx-app-id',
    app_secret_enc: envelope,
    mp_id: 'mp-id',
    service_type: 'service',
    verify: true,
    proxy_origin: null,
    created_by: 'user-1',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function returningQuery(result: unknown) {
  const wheres: unknown[][] = [];
  const query = {
    where: jest.fn((...args: unknown[]) => {
      wheres.push(args);
      return query;
    }),
    orderBy: jest.fn(() => query),
    selectAll: jest.fn(() => query),
    set: jest.fn(() => query),
    values: jest.fn(() => query),
    returningAll: jest.fn(() => query),
    execute: jest.fn().mockResolvedValue(result),
    executeTakeFirst: jest.fn().mockResolvedValue(result),
    executeTakeFirstOrThrow: jest.fn().mockResolvedValue(result),
  };
  return { query, wheres };
}

describe('WechatAccountService', () => {
  const cipher = {
    encrypt: jest.fn().mockReturnValue(envelope),
    decrypt: jest.fn().mockReturnValue('plaintext-secret'),
  };
  const wechat = {
    verifyCredentials: jest.fn().mockResolvedValue(undefined),
    uploadImage: jest
      .fn()
      .mockResolvedValue({ url: 'https://mmbiz.qpic.cn/x' }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('lists only the requested workspace and never exposes a secret', async () => {
    const { query, wheres } = returningQuery([accountRow()]);
    const db = { selectFrom: jest.fn().mockReturnValue(query) };
    const service = new WechatAccountService(
      db as never,
      cipher as never,
      wechat as never,
    );

    const result = await service.list('workspace-a');

    expect(wheres).toContainEqual(['workspace_id', '=', 'workspace-a']);
    expect(result).toEqual([
      {
        id: 'account-1',
        name: 'Main account',
        appId: 'wx-app-id',
        mpId: 'mp-id',
        serviceType: 'service',
        verify: true,
        secretConfigured: true,
        proxyOrigin: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('encrypted');
    expect(JSON.stringify(result)).not.toContain('app_secret');
  });

  it('encrypts AppSecret on create and returns a sanitized account', async () => {
    const { query } = returningQuery(accountRow());
    const db = { insertInto: jest.fn().mockReturnValue(query) };
    const service = new WechatAccountService(
      db as never,
      cipher as never,
      wechat as never,
    );

    const result = await service.create(
      {
        name: 'Main account',
        appId: 'wx-app-id',
        appSecret: 'plaintext-secret',
      },
      'workspace-a',
      'user-1',
    );

    expect(cipher.encrypt).toHaveBeenCalledWith('plaintext-secret');
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'workspace-a',
        created_by: 'user-1',
        app_secret_enc: envelope,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('plaintext-secret');
    expect(JSON.stringify(result)).not.toContain('encrypted');
  });

  it('keeps the existing secret on empty update and filters by workspace', async () => {
    const { query, wheres } = returningQuery(accountRow());
    const db = { updateTable: jest.fn().mockReturnValue(query) };
    const service = new WechatAccountService(
      db as never,
      cipher as never,
      wechat as never,
    );

    await service.update(
      { id: 'account-1', name: 'Renamed', appSecret: '' },
      'workspace-a',
    );

    expect(cipher.encrypt).not.toHaveBeenCalled();
    expect(query.set).toHaveBeenCalledWith(
      expect.not.objectContaining({ app_secret_enc: expect.anything() }),
    );
    expect(wheres).toEqual([
      ['id', '=', 'account-1'],
      ['workspace_id', '=', 'workspace-a'],
    ]);
  });

  it('does not update an account from another workspace', async () => {
    const { query } = returningQuery(undefined);
    const db = { updateTable: jest.fn().mockReturnValue(query) };
    const service = new WechatAccountService(
      db as never,
      cipher as never,
      wechat as never,
    );

    await expect(
      service.update({ id: 'account-1', name: 'Renamed' }, 'workspace-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not delete an account from another workspace', async () => {
    const { query, wheres } = returningQuery({ numDeletedRows: 0n });
    const db = { deleteFrom: jest.fn().mockReturnValue(query) };
    const service = new WechatAccountService(
      db as never,
      cipher as never,
      wechat as never,
    );

    await expect(
      service.delete('account-1', 'workspace-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(wheres).toEqual([
      ['id', '=', 'account-1'],
      ['workspace_id', '=', 'workspace-b'],
    ]);
  });

  it('normalizes the proxy origin before storing it', async () => {
    const { query } = returningQuery(accountRow());
    const db = { insertInto: jest.fn().mockReturnValue(query) };
    const service = new WechatAccountService(
      db as never,
      cipher as never,
      wechat as never,
    );

    await service.create(
      {
        name: 'Main account',
        appId: 'wx-app-id',
        appSecret: 'plaintext-secret',
        proxyOrigin: 'wechat.example.workers.dev/',
      },
      'workspace-a',
      'user-1',
    );

    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        proxy_origin: 'https://wechat.example.workers.dev',
      }),
    );
  });

  it('reports which step of the connection test failed', async () => {
    const { query } = returningQuery(
      accountRow({ proxy_origin: 'https://wechat.example.workers.dev' }),
    );
    const db = { selectFrom: jest.fn().mockReturnValue(query) };
    const service = new WechatAccountService(
      db as never,
      cipher as never,
      wechat as never,
    );
    wechat.uploadImage.mockRejectedValueOnce(
      new Error('WeChat request failed (48001): api unauthorized'),
    );

    const result = await service.testConnection('account-1', 'workspace-a');

    expect(wechat.verifyCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        proxyOrigin: 'https://wechat.example.workers.dev',
      }),
    );
    expect(result).toEqual({
      ok: false,
      step: 'upload',
      message: 'WeChat request failed (48001): api unauthorized',
    });
  });

  it('passes the connection test when both steps succeed', async () => {
    const { query, wheres } = returningQuery(accountRow());
    const db = { selectFrom: jest.fn().mockReturnValue(query) };
    const service = new WechatAccountService(
      db as never,
      cipher as never,
      wechat as never,
    );

    const result = await service.testConnection('account-1', 'workspace-a');

    expect(wheres).toContainEqual(['workspace_id', '=', 'workspace-a']);
    expect(result).toEqual({ ok: true, step: 'upload' });
  });
});

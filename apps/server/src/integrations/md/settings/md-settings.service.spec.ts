import { BadRequestException } from '@nestjs/common';
import { MdSettingsService } from './md-settings.service';

describe('MdSettingsService', () => {
  it.each([
    'mpConfig',
    'MD__mpConfig',
    'githubConfig',
    'openai_key_api',
    'appSecret',
  ])('rejects unsafe setting key %s', async (key) => {
    const db = { insertInto: jest.fn() };
    const service = new MdSettingsService(db as never);

    await expect(
      service.upsert('user-1', [{ key, value: 'secret', updatedAt: 1 }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('reads only allowlisted settings for the mdSession user', async () => {
    const query = {
      select: jest.fn(() => query),
      where: jest.fn(() => query),
      orderBy: jest.fn(() => query),
      execute: jest.fn().mockResolvedValue([
        {
          key: 'locale',
          value: 'zh-CN',
          updated_at: new Date('2026-07-30T00:00:00Z'),
        },
      ]),
    };
    const db = { selectFrom: jest.fn().mockReturnValue(query) };
    const service = new MdSettingsService(db as never);

    await expect(service.list('user-1')).resolves.toEqual([
      {
        key: 'locale',
        value: 'zh-CN',
        updatedAt: new Date('2026-07-30T00:00:00Z').getTime(),
      },
    ]);
    expect(query.where).toHaveBeenCalledWith('user_id', '=', 'user-1');
    expect(query.where).toHaveBeenCalledWith(
      'key',
      'in',
      expect.not.arrayContaining(['mpConfig', 'appSecret']),
    );
  });

  it('batch upserts allowlisted settings through the LWW conflict path', async () => {
    const conflict = {
      columns: jest.fn(),
      doUpdateSet: jest.fn(),
    };
    conflict.columns.mockReturnValue(conflict);
    conflict.doUpdateSet.mockReturnValue(conflict);
    const insert = {
      values: jest.fn(() => insert),
      onConflict: jest.fn((callback: (builder: typeof conflict) => unknown) => {
        callback(conflict);
        return insert;
      }),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const select = {
      select: jest.fn(() => select),
      where: jest.fn(() => select),
      orderBy: jest.fn(() => select),
      execute: jest.fn().mockResolvedValue([]),
    };
    const db = {
      insertInto: jest.fn().mockReturnValue(insert),
      selectFrom: jest.fn().mockReturnValue(select),
    };
    const service = new MdSettingsService(db as never);

    await service.upsert('user-1', [
      { key: 'locale', value: 'zh-CN', updatedAt: 100 },
      { key: 'viewMode', value: 'preview', updatedAt: 200 },
    ]);

    expect(insert.values).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        key: 'locale',
        updated_at: new Date(100),
      }),
      expect.objectContaining({
        user_id: 'user-1',
        key: 'viewMode',
        updated_at: new Date(200),
      }),
    ]);
    expect(conflict.columns).toHaveBeenCalledWith(['user_id', 'key']);
    expect(conflict.doUpdateSet).toHaveBeenCalledWith({
      value: expect.anything(),
      updated_at: expect.anything(),
    });
  });
});

import { UnauthorizedException } from '@nestjs/common';
import { MdSessionService } from './md-session.service';
import { hashToken } from '../tickets/md-ticket.service';

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

describe('MdSessionService', () => {
  it('stores only the session hash', async () => {
    const query = {
      values: jest.fn(() => query),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const db = { insertInto: jest.fn().mockReturnValue(query) };
    const service = new MdSessionService(db as never);

    const result = await service.create('user-1', 'page-1');
    const persisted = query.values.mock.calls[0][0];

    expect(persisted.token_hash).toBe(hashToken(result.token));
    expect(JSON.stringify(persisted)).not.toContain(result.token);
  });

  it('rejects expired sessions', async () => {
    const { query, wheres } = selectQuery(undefined);
    const db = { selectFrom: jest.fn().mockReturnValue(query) };
    const service = new MdSessionService(db as never);

    await expect(service.validate('expired-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(wheres).toContainEqual(['expires_at', '>', expect.any(Date)]);
  });

  it('rejects revoked sessions', async () => {
    const { query, wheres } = selectQuery(undefined);
    const db = { selectFrom: jest.fn().mockReturnValue(query) };
    const service = new MdSessionService(db as never);

    await expect(service.validate('revoked-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(wheres).toContainEqual(['revoked_at', 'is', null]);
  });

  it('revokes by token hash', async () => {
    const wheres: unknown[][] = [];
    const query = {
      set: jest.fn(() => query),
      where: jest.fn((...args: unknown[]) => {
        wheres.push(args);
        return query;
      }),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const db = { updateTable: jest.fn().mockReturnValue(query) };
    const service = new MdSessionService(db as never);

    await service.revoke('hashed-token');

    expect(wheres).toContainEqual(['token_hash', '=', 'hashed-token']);
    expect(query.set).toHaveBeenCalledWith({
      revoked_at: expect.any(Date),
    });
  });
});

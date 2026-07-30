import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { MdTicketService, hashToken } from './md-ticket.service';

function chainQuery(result?: unknown) {
  const wheres: unknown[][] = [];
  const query = {
    values: jest.fn(() => query),
    set: jest.fn(() => query),
    where: jest.fn((...args: unknown[]) => {
      wheres.push(args);
      return query;
    }),
    returning: jest.fn(() => query),
    execute: jest.fn().mockResolvedValue(undefined),
    executeTakeFirst: jest.fn().mockResolvedValue(result),
  };
  return { query, wheres };
}

describe('MdTicketService', () => {
  const page = {
    id: 'page-1',
    workspaceId: 'workspace-a',
    spaceId: 'space-1',
  };
  const user = {
    id: 'user-1',
    workspaceId: 'workspace-a',
  };

  beforeEach(() => jest.clearAllMocks());

  it('requires page view access before issuing a ticket', async () => {
    const { query } = chainQuery();
    const db = { insertInto: jest.fn().mockReturnValue(query) };
    const pageRepo = { findById: jest.fn().mockResolvedValue(page) };
    const access = {
      validateCanView: jest.fn().mockRejectedValue(new ForbiddenException()),
    };
    const service = new MdTicketService(
      db as never,
      pageRepo as never,
      access as never,
    );

    await expect(service.create(page.id, user as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('returns the raw ticket once while persisting only its SHA-256 hash', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-30T00:00:00Z'));
    const { query } = chainQuery();
    const db = { insertInto: jest.fn().mockReturnValue(query) };
    const pageRepo = { findById: jest.fn().mockResolvedValue(page) };
    const access = { validateCanView: jest.fn().mockResolvedValue(undefined) };
    const service = new MdTicketService(
      db as never,
      pageRepo as never,
      access as never,
    );

    const result = await service.create(page.id, user as never);
    const persisted = query.values.mock.calls[0][0];

    expect(result.expiresAt).toBe(Date.now() + 60_000);
    expect(persisted.ticket_hash).toBe(hashToken(result.ticket));
    expect(JSON.stringify(persisted)).not.toContain(result.ticket);
    jest.useRealTimers();
  });

  it('atomically consumes a valid ticket once', async () => {
    const { query, wheres } = chainQuery({
      user_id: 'user-1',
      page_id: 'page-1',
    });
    query.executeTakeFirst
      .mockResolvedValueOnce({ user_id: 'user-1', page_id: 'page-1' })
      .mockResolvedValueOnce(undefined);
    const db = { updateTable: jest.fn().mockReturnValue(query) };
    const service = new MdTicketService(db as never, {} as never, {} as never);

    await expect(service.consume('one-time-ticket')).resolves.toEqual({
      userId: 'user-1',
      pageId: 'page-1',
    });
    await expect(service.consume('one-time-ticket')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(wheres).toEqual(
      expect.arrayContaining([
        ['ticket_hash', '=', hashToken('one-time-ticket')],
        ['consumed_at', 'is', null],
        ['expires_at', '>', expect.any(Date)],
      ]),
    );
  });

  it('rejects expired tickets through the atomic update predicate', async () => {
    const { query, wheres } = chainQuery(undefined);
    const db = { updateTable: jest.fn().mockReturnValue(query) };
    const service = new MdTicketService(db as never, {} as never, {} as never);

    await expect(service.consume('expired-ticket')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(wheres).toContainEqual(['expires_at', '>', expect.any(Date)]);
  });
});

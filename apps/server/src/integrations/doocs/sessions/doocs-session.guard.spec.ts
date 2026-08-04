import { UnauthorizedException } from '@nestjs/common';
import {
  DoocsSessionGuard,
  DOOCS_SESSION_REQUEST_KEY,
} from './doocs-session.guard';

function context(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

describe('DoocsSessionGuard', () => {
  it('rejects requests without a custom bearer token', async () => {
    const guard = new DoocsSessionGuard({ validate: jest.fn() } as never);

    await expect(
      guard.canActivate(context({ headers: {} }) as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid or expired custom bearer token', async () => {
    const sessions = {
      validate: jest
        .fn()
        .mockRejectedValue(
          new UnauthorizedException('Invalid or expired md session'),
        ),
    };
    const request = {
      headers: { authorization: 'Bearer invalid-md-session-token' },
    };
    const guard = new DoocsSessionGuard(sessions as never);

    await expect(
      guard.canActivate(context(request) as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request[DOOCS_SESSION_REQUEST_KEY]).toBeUndefined();
  });

  it('validates the bearer and attaches only the session principal', async () => {
    const principal = {
      tokenHash: 'hash',
      userId: 'user-1',
      pageId: 'page-1',
      expiresAt: new Date(Date.now() + 1000),
    };
    const sessions = {
      validate: jest.fn().mockResolvedValue(principal),
    };
    const request = {
      headers: { authorization: 'Bearer md-session-token' },
    };
    const guard = new DoocsSessionGuard(sessions as never);

    await expect(guard.canActivate(context(request) as never)).resolves.toBe(
      true,
    );
    expect(sessions.validate).toHaveBeenCalledWith('md-session-token');
    expect(request[DOOCS_SESSION_REQUEST_KEY]).toEqual(principal);
  });
});

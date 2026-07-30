import { ForbiddenException } from '@nestjs/common';
import { WechatAccountController } from './wechat-account.controller';

describe('WechatAccountController', () => {
  const workspace = { id: 'workspace-a' };
  const user = { id: 'user-1', role: 'member' };

  it('requires workspace settings management permission for CRUD', async () => {
    const accounts = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const ability = {
      createForUser: jest.fn().mockReturnValue({
        cannot: jest.fn().mockReturnValue(true),
      }),
    };
    const controller = new WechatAccountController(
      accounts as never,
      ability as never,
    );

    await expect(
      controller.list(user as never, workspace as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(accounts.list).not.toHaveBeenCalled();
  });
});

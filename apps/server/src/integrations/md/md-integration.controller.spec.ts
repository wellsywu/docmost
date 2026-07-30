import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MdIntegrationController } from './md-integration.controller';
import { MdSessionGuard } from './sessions/md-session.guard';

describe('MdIntegrationController authentication metadata', () => {
  it('does not mark ticket issuance public and keeps the JWT guard', () => {
    const classGuards =
      Reflect.getMetadata(GUARDS_METADATA, MdIntegrationController) ?? [];
    const ticketHandler = MdIntegrationController.prototype.createTicket;

    expect(classGuards).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ticketHandler)).not.toBe(true);
  });

  it('uses the mdSession guard on public settings routes', () => {
    const handler = MdIntegrationController.prototype.updateSettings;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(guards).toContain(MdSessionGuard);
  });

  it('uses the mdSession guard on the public multipart upload route', () => {
    const handler = MdIntegrationController.prototype.uploadImage;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(guards).toContain(MdSessionGuard);
  });
});

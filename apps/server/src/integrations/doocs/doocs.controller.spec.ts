import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DoocsController } from './doocs.controller';
import { DoocsSessionGuard } from './sessions/doocs-session.guard';

jest.mock('../../core/page/services/page.service', () => ({
  PageService: class PageService {},
}));

describe('DoocsController authentication metadata', () => {
  it('does not mark ticket issuance public and keeps the JWT guard', () => {
    const classGuards =
      Reflect.getMetadata(GUARDS_METADATA, DoocsController) ?? [];
    const ticketHandler = DoocsController.prototype.createTicket;

    expect(classGuards).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ticketHandler)).not.toBe(true);
  });

  it('uses the mdSession guard on public settings routes', () => {
    const handler = DoocsController.prototype.updateSettings;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(guards).toContain(DoocsSessionGuard);
  });

  it('uses the mdSession guard on the public content update route', () => {
    const handler = DoocsController.prototype.updateContent;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(guards).toContain(DoocsSessionGuard);
  });

  it('uses the mdSession guard on the public multipart upload route', () => {
    const handler = DoocsController.prototype.uploadImage;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(guards).toContain(DoocsSessionGuard);
  });

  it.each(['publishAttachment', 'publishFile'] as const)(
    'uses the mdSession guard on the public %s route',
    (method) => {
      const handler = DoocsController.prototype[method];
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(guards).toContain(DoocsSessionGuard);
    },
  );

  it('uses the mdSession guard on the public upload config route', () => {
    const handler = DoocsController.prototype.readUploadConfig;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(guards).toContain(DoocsSessionGuard);
  });

  it('keeps admin upload config routes behind the JWT guard', () => {
    const readHandler = DoocsController.prototype.getUploadConfig;
    const updateHandler = DoocsController.prototype.updateUploadConfig;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, readHandler)).not.toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, updateHandler)).not.toBe(true);
  });
});

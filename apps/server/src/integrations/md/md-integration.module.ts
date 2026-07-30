import { Module } from '@nestjs/common';
import { WechatAccountController } from './accounts/wechat-account.controller';
import { WechatAccountService } from './accounts/wechat-account.service';
import { MdSecretCipherService } from './security/md-secret-cipher.service';
import { MdIntegrationController } from './md-integration.controller';
import { MdTicketService } from './tickets/md-ticket.service';
import { MdSessionService } from './sessions/md-session.service';
import { MdSessionGuard } from './sessions/md-session.guard';
import { MdSettingsService } from './settings/md-settings.service';
import { MdIntegrationService } from './md-integration.service';
import { MdUploadService } from './upload/md-upload.service';
import {
  WECHAT_FETCH,
  WechatApiService,
} from './upload/wechat/wechat-api.service';

@Module({
  controllers: [WechatAccountController, MdIntegrationController],
  providers: [
    WechatAccountService,
    MdSecretCipherService,
    MdTicketService,
    MdSessionService,
    MdSessionGuard,
    MdSettingsService,
    MdIntegrationService,
    MdUploadService,
    WechatApiService,
    {
      provide: WECHAT_FETCH,
      useFactory: () => globalThis.fetch.bind(globalThis),
    },
  ],
  exports: [WechatAccountService, MdSecretCipherService],
})
export class MdIntegrationModule {}

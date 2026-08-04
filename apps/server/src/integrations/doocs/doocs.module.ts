import { Module } from '@nestjs/common';
import { CaslModule } from '../../core/casl/casl.module';
import { AttachmentModule } from '../../core/attachment/attachment.module';
import { PageModule } from '../../core/page/page.module';
import { PageAccessModule } from '../../core/page/page-access/page-access.module';
import { DoocsConfigModule } from './config/doocs-config.module';
import { DoocsDatabaseModule } from './database/doocs-database.module';
import { WechatAccountController } from './accounts/wechat-account.controller';
import { WechatAccountService } from './accounts/wechat-account.service';
import { DoocsSecretCipherService } from './security/doocs-secret-cipher.service';
import { DoocsController } from './doocs.controller';
import { DoocsTicketService } from './tickets/doocs-ticket.service';
import { DoocsSessionService } from './sessions/doocs-session.service';
import { DoocsSessionGuard } from './sessions/doocs-session.guard';
import { DoocsSettingsService } from './settings/doocs-settings.service';
import { DoocsService } from './doocs.service';
import { DoocsUploadConfigService } from './upload/doocs-upload-config.service';
import { DoocsS3UploadService } from './upload/s3/doocs-s3-upload.service';
import { DoocsUploadService } from './upload/doocs-upload.service';
import {
  WECHAT_FETCH,
  WechatApiService,
} from './upload/wechat/wechat-api.service';

/**
 * Self-contained doocs/md integration. `app.module.ts` registers this module and
 * nothing else — the database connection, configuration and controllers all live
 * behind this boundary, and nothing is exported to Docmost core.
 */
@Module({
  imports: [
    CaslModule,
    AttachmentModule,
    PageAccessModule,
    PageModule,
    DoocsConfigModule,
    DoocsDatabaseModule,
  ],
  controllers: [WechatAccountController, DoocsController],
  providers: [
    WechatAccountService,
    DoocsSecretCipherService,
    DoocsTicketService,
    DoocsSessionService,
    DoocsSessionGuard,
    DoocsSettingsService,
    DoocsService,
    DoocsUploadConfigService,
    DoocsUploadService,
    DoocsS3UploadService,
    WechatApiService,
    {
      provide: WECHAT_FETCH,
      useFactory: () => globalThis.fetch.bind(globalThis),
    },
  ],
})
export class DoocsModule {}

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { FileInterceptor } from '../../common/interceptors/file.interceptor';
import {
  BootstrapDoocsDto,
  CreateDoocsTicketDto,
  DoocsWechatCredentialsDto,
  LookupDoocsPublishAssetsDto,
  PublishDoocsAttachmentDto,
  RegisterDoocsPublishAssetsDto,
  UpdateDoocsContentDto,
  UpdateDoocsUploadConfigDto,
  UpdateDoocsSettingsDto,
} from './dto/doocs.dto';
import { DoocsService } from './doocs.service';
import { DoocsSession } from './sessions/doocs-session.decorator';
import { DoocsSessionGuard } from './sessions/doocs-session.guard';
import {
  DoocsSessionPrincipal,
  DoocsSessionService,
} from './sessions/doocs-session.service';
import { DoocsSettingsService } from './settings/doocs-settings.service';
import { DoocsTicketService } from './tickets/doocs-ticket.service';
import { DoocsUploadConfigService } from './upload/doocs-upload-config.service';
import { DoocsUploadService } from './upload/doocs-upload.service';
import { DoocsConfigService } from './config/doocs-config.service';
import { DOOCS_ROUTE_PREFIX } from './doocs.routes';

@UseGuards(JwtAuthGuard)
@Controller(DOOCS_ROUTE_PREFIX)
export class DoocsController {
  constructor(
    private readonly tickets: DoocsTicketService,
    private readonly integration: DoocsService,
    private readonly settings: DoocsSettingsService,
    private readonly sessions: DoocsSessionService,
    private readonly uploads: DoocsUploadService,
    private readonly uploadConfig: DoocsUploadConfigService,
    private readonly config: DoocsConfigService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  /**
   * Lets the Docmost client discover whether the doocs editor is deployed and
   * where it lives, without Docmost core having to inject doocs values into
   * `window.CONFIG` (static.module.ts) and the Vite define block.
   */
  @Get('config')
  getConfig() {
    return { editorUrl: this.config.getEditorUrl() };
  }

  @HttpCode(HttpStatus.OK)
  @Post('tickets')
  createTicket(@Body() dto: CreateDoocsTicketDto, @AuthUser() user: User) {
    return this.tickets.create(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('upload-config')
  getUploadConfig(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return this.uploadConfig.getPublic(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('upload-config/update')
  updateUploadConfig(
    @Body() dto: UpdateDoocsUploadConfigDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return this.uploadConfig.update(workspace.id, user.id, dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('bootstrap')
  bootstrap(@Body() dto: BootstrapDoocsDto) {
    return this.integration.bootstrap(dto.ticket);
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('settings')
  readSettings(@DoocsSession() session: DoocsSessionPrincipal) {
    return this.settings.list(session.userId);
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('settings/update')
  updateSettings(
    @Body() dto: UpdateDoocsSettingsDto,
    @DoocsSession() session: DoocsSessionPrincipal,
  ) {
    return this.settings.upsert(session.userId, dto.settings);
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('content/update')
  updateContent(
    @Body() dto: UpdateDoocsContentDto,
    @DoocsSession() session: DoocsSessionPrincipal,
  ) {
    return this.integration.updateContent(session, dto);
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('upload/config')
  readUploadConfig(@DoocsSession() session: DoocsSessionPrincipal) {
    return this.uploadConfig.getPublicForSession(session);
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @UseInterceptors(FileInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('upload')
  uploadImage(
    @Req() request: FastifyRequest,
    @DoocsSession() session: DoocsSessionPrincipal,
  ) {
    return this.uploads.upload(request, session);
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('upload/publish')
  publishAttachment(
    @Body() dto: PublishDoocsAttachmentDto,
    @DoocsSession() session: DoocsSessionPrincipal,
  ) {
    return this.uploads.publishAttachment(
      dto.attachmentId,
      dto.accountId,
      session,
    );
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @UseInterceptors(FileInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('upload/publish-file')
  publishFile(
    @Req() request: FastifyRequest,
    @DoocsSession() session: DoocsSessionPrincipal,
  ) {
    return this.uploads.publishFile(request, session);
  }

  /**
   * Browser-side WeChat publishing. The editor asks for the account's upload
   * credentials, does the upload itself the way standalone doocs does, then
   * reports the resulting image-host URL back here.
   */
  @Public()
  @UseGuards(DoocsSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('upload/wechat-credentials')
  getWechatCredentials(
    @Body() dto: DoocsWechatCredentialsDto,
    @DoocsSession() session: DoocsSessionPrincipal,
  ) {
    return this.uploads.getWechatUploadCredentials(dto.accountId, session);
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('upload/publish-assets')
  registerPublishAssets(
    @Body() dto: RegisterDoocsPublishAssetsDto,
    @DoocsSession() session: DoocsSessionPrincipal,
  ) {
    return this.uploads.registerPublishAssets(
      dto.assets,
      dto.accountId,
      session,
    );
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('upload/publish-assets/lookup')
  lookupPublishAssets(
    @Body() dto: LookupDoocsPublishAssetsDto,
    @DoocsSession() session: DoocsSessionPrincipal,
  ) {
    return this.uploads.lookupPublishAssets(
      dto.attachmentIds,
      dto.accountId,
      session,
    );
  }

  @Public()
  @UseGuards(DoocsSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('sessions/revoke')
  async revokeSession(@DoocsSession() session: DoocsSessionPrincipal) {
    await this.sessions.revoke(session.tokenHash);
    return { success: true };
  }

  private assertCanManage(user: User, workspace: Workspace): void {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }
}

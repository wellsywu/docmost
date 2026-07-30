import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { User } from '@docmost/db/types/entity.types';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FileInterceptor } from '../../common/interceptors/file.interceptor';
import {
  BootstrapMdIntegrationDto,
  CreateMdTicketDto,
  UpdateMdSettingsDto,
} from './dto/md-integration.dto';
import { MdIntegrationService } from './md-integration.service';
import { MdSession } from './sessions/md-session.decorator';
import { MdSessionGuard } from './sessions/md-session.guard';
import {
  MdSessionPrincipal,
  MdSessionService,
} from './sessions/md-session.service';
import { MdSettingsService } from './settings/md-settings.service';
import { MdTicketService } from './tickets/md-ticket.service';
import { MdUploadService } from './upload/md-upload.service';

@UseGuards(JwtAuthGuard)
@Controller('integrations/md')
export class MdIntegrationController {
  constructor(
    private readonly tickets: MdTicketService,
    private readonly integration: MdIntegrationService,
    private readonly settings: MdSettingsService,
    private readonly sessions: MdSessionService,
    private readonly uploads: MdUploadService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('tickets')
  createTicket(@Body() dto: CreateMdTicketDto, @AuthUser() user: User) {
    return this.tickets.create(dto.pageId, user);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('bootstrap')
  bootstrap(@Body() dto: BootstrapMdIntegrationDto) {
    return this.integration.bootstrap(dto.ticket);
  }

  @Public()
  @UseGuards(MdSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('settings')
  readSettings(@MdSession() session: MdSessionPrincipal) {
    return this.settings.list(session.userId);
  }

  @Public()
  @UseGuards(MdSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('settings/update')
  updateSettings(
    @Body() dto: UpdateMdSettingsDto,
    @MdSession() session: MdSessionPrincipal,
  ) {
    return this.settings.upsert(session.userId, dto.settings);
  }

  @Public()
  @UseGuards(MdSessionGuard)
  @UseInterceptors(FileInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('upload')
  uploadImage(
    @Req() request: FastifyRequest,
    @MdSession() session: MdSessionPrincipal,
  ) {
    return this.uploads.upload(request, session);
  }

  @Public()
  @UseGuards(MdSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('sessions/revoke')
  async revokeSession(@MdSession() session: MdSessionPrincipal) {
    await this.sessions.revoke(session.tokenHash);
    return { success: true };
  }
}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { CreateApiKeyDto, RevokeApiKeyDto, UpdateApiKeyDto } from './dto/api-key.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * 列出当前用户的 API Key 列表（支持管理员全量视图）
   */
  @HttpCode(HttpStatus.OK)
  @Post()
  async list(
    @Body() pagination: PaginationOptions & { adminView?: boolean },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.apiKeyService.list(
      user.id,
      workspace.id,
      pagination,
      pagination?.adminView === true,
    );
  }

  /**
   * 创建 API Key，返回一次性明文 token
   */
  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() dto: CreateApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.apiKeyService.create(dto, user, workspace);
  }

  /**
   * 更新 API Key 名称
   */
  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() dto: UpdateApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.apiKeyService.update(dto, user.id, workspace.id);
  }

  /**
   * 撤销 API Key（软删除）
   */
  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  async revoke(
    @Body() dto: RevokeApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.apiKeyService.revoke(dto.apiKeyId, user.id, workspace.id);
  }
}

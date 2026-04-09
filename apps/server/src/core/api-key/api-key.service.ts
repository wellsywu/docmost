import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { TokenService } from '../auth/services/token.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { JwtApiKeyPayload } from '../auth/dto/jwt-payload';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/api-key.dto';
import { User, Workspace } from '@docmost/db/types/entity.types';
import * as crypto from 'crypto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  /**
   * 计算 token 的 SHA-256 哈希值
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * 创建 API Key：生成 JWT → 计算哈希 → 写入数据库
   * 返回的 token 只有此时可以查看，后续不再返回原始 token
   */
  async create(
    dto: CreateApiKeyDto,
    user: User,
    workspace: Workspace,
  ): Promise<any> {
    // 先占位插入记录，获取 id
    const [apiKeyRecord] = await this.db
      .insertInto('api_keys')
      .values({
        name: dto.name,
        creator_id: user.id,
        workspace_id: workspace.id,
        expires_at: dto.expiresAt ? new Date(dto.expiresAt) : null,
      })
      .returning([
        'id',
        'name',
        'creator_id',
        'workspace_id',
        'expires_at',
        'created_at',
        'updated_at',
      ])
      .execute();

    if (!apiKeyRecord) {
      throw new BadRequestException('创建 API Key 失败');
    }

    // 使用插入后的 id 生成 JWT
    const expiresIn = dto.expiresAt
      ? Math.floor(
          (new Date(dto.expiresAt).getTime() - Date.now()) / 1000,
        )
      : undefined;

    const token = await this.tokenService.generateApiToken({
      apiKeyId: apiKeyRecord.id,
      user,
      workspaceId: workspace.id,
      expiresIn: expiresIn && expiresIn > 0 ? expiresIn : undefined,
    });

    // 计算哈希并更新记录
    const keyHash = this.hashToken(token);
    await this.db
      .updateTable('api_keys')
      .set({ key_hash: keyHash })
      .where('id', '=', apiKeyRecord.id)
      .execute();

    return {
      ...apiKeyRecord,
      token,  // 仅此一次返回原始 token
      creatorId: apiKeyRecord.creator_id,
      workspaceId: apiKeyRecord.workspace_id,
      expiresAt: apiKeyRecord.expires_at,
      createdAt: apiKeyRecord.created_at,
      creator: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    };
  }

  /**
   * 验证 API Key（由 JwtStrategy 调用）
   * 验证 JWT payload 中的 apiKeyId 对应的记录是否有效
   */
  async validateApiKey(payload: JwtApiKeyPayload): Promise<{ user: any; workspace: any }> {
    const { sub: userId, workspaceId, apiKeyId } = payload;

    const apiKey = await this.db
      .selectFrom('api_keys')
      .selectAll()
      .where('id', '=', apiKeyId)
      .where('workspace_id', '=', workspaceId)
      .where('creator_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!apiKey) {
      throw new UnauthorizedException('API Key 不存在或已被撤销');
    }

    // 检查有无过期
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      throw new UnauthorizedException('API Key 已过期');
    }

    // 更新最后使用时间（异步不阻塞）
    this.db
      .updateTable('api_keys')
      .set({ last_used_at: new Date() })
      .where('id', '=', apiKeyId)
      .execute()
      .catch(() => {});

    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new UnauthorizedException('工作空间不存在');
    }

    return { user, workspace };
  }

  /**
   * 列出当前用户的 API Key（分页）
   */
  async list(
    userId: string,
    workspaceId: string,
    pagination: PaginationOptions,
    adminView = false,
  ): Promise<any> {
    let query = this.db
      .selectFrom('api_keys as ak')
      .leftJoin('users as u', 'u.id', 'ak.creator_id')
      .select([
        'ak.id',
        'ak.name',
        'ak.creator_id',
        'ak.workspace_id',
        'ak.expires_at',
        'ak.last_used_at',
        'ak.created_at',
        'ak.updated_at',
        'u.id as user_id',
        'u.name as user_name',
        'u.email as user_email',
        'u.avatar_url as user_avatar_url',
      ])
      .where('ak.workspace_id', '=', workspaceId)
      .where('ak.deleted_at', 'is', null);

    // 非管理员视图：只看自己的
    if (!adminView) {
      query = query.where('ak.creator_id', '=', userId);
    }

    query = query.orderBy('ak.created_at', 'desc');

    const limit = pagination?.limit ?? 20;
    const cursor = pagination?.cursor;

    if (cursor) {
      query = query.where('ak.id', '<', cursor);
    }

    const items = await query.limit(limit + 1).execute();
    const hasNextPage = items.length > limit;
    if (hasNextPage) items.pop();

    const nextCursor = hasNextPage ? items[items.length - 1]?.id : undefined;

    const mappedItems = items.map((item) => ({
      id: item.id,
      name: item.name,
      creatorId: item.creator_id,
      workspaceId: item.workspace_id,
      expiresAt: item.expires_at,
      lastUsedAt: item.last_used_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      creator: {
        id: item.user_id,
        name: item.user_name,
        email: item.user_email,
        avatarUrl: item.user_avatar_url,
      },
    }));

    return {
      items: mappedItems,
      meta: {
        hasNextPage,
        hasPrevPage: !!cursor,
        nextCursor,
      },
    };
  }

  /**
   * 更新 API Key 名称
   */
  async update(
    dto: UpdateApiKeyDto,
    userId: string,
    workspaceId: string,
  ): Promise<any> {
    const apiKey = await this.db
      .selectFrom('api_keys')
      .selectAll()
      .where('id', '=', dto.apiKeyId)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }

    // 只有创建者或管理员可以更新；此处先检查创建者
    if (apiKey.creator_id !== userId) {
      throw new ForbiddenException('无权操作此 API Key');
    }

    const [updated] = await this.db
      .updateTable('api_keys')
      .set({ name: dto.name, updated_at: new Date() })
      .where('id', '=', dto.apiKeyId)
      .returning([
        'id',
        'name',
        'creator_id',
        'workspace_id',
        'expires_at',
        'last_used_at',
        'created_at',
        'updated_at',
      ])
      .execute();

    return {
      ...updated,
      creatorId: updated.creator_id,
      workspaceId: updated.workspace_id,
      expiresAt: updated.expires_at,
      lastUsedAt: updated.last_used_at,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  /**
   * 撤销 API Key（软删除）
   */
  async revoke(
    apiKeyId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const apiKey = await this.db
      .selectFrom('api_keys')
      .selectAll()
      .where('id', '=', apiKeyId)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }

    if (apiKey.creator_id !== userId) {
      throw new ForbiddenException('无权撤销此 API Key');
    }

    await this.db
      .updateTable('api_keys')
      .set({ deleted_at: new Date() })
      .where('id', '=', apiKeyId)
      .execute();
  }
}

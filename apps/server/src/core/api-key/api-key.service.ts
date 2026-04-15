import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/api-key.dto';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { UserRole } from '../../common/helpers/types/permission';

/** 生成 Opaque Token 的 sha256 哈希 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  /**
   * 创建 API Key
   * 生成随机 Opaque Token (dm_sk_ + 64 hex chars)，存储 sha256 hash
   * 原始 token 只在创建时返回一次，此后无法查询
   */
  async create(
    dto: CreateApiKeyDto,
    user: User,
    workspace: Workspace,
  ): Promise<any> {
    // 生成随机 Opaque Token：dm_sk_ + 32 字节随机 hex = 70 字符
    const rawToken = 'dm_sk_' + crypto.randomBytes(32).toString('hex');
    // 只存 hash，不存原始 token
    const keyHash = hashToken(rawToken);

    const apiKeyRecord = await this.db
      .insertInto('apiKeys')
      .values({
        name: dto.name,
        creatorId: user.id,
        workspaceId: workspace.id,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        keyHash,
      })
      .returning([
        'id',
        'name',
        'creatorId',
        'workspaceId',
        'expiresAt',
        'createdAt',
        'updatedAt',
      ])
      .executeTakeFirst();

    if (!apiKeyRecord) {
      throw new BadRequestException('创建 API Key 失败');
    }

    return {
      id: apiKeyRecord.id,
      name: apiKeyRecord.name,
      token: rawToken, // ⚠️ 仅此一次返回，后续无法查询
      creatorId: apiKeyRecord.creatorId,
      workspaceId: apiKeyRecord.workspaceId,
      expiresAt: apiKeyRecord.expiresAt,
      createdAt: apiKeyRecord.createdAt,
      creator: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  /**
   * 验证 API Key（由 JwtAuthGuard 调用）
   * 接收原始 token 字符串，计算 sha256 查库验证
   *
   * @param rawToken 原始 dm_sk_xxx 格式 token
   */
  async validateApiKey(rawToken: string): Promise<{ user: any; workspace: any }> {
    const keyHash = hashToken(rawToken);

    const apiKey = await this.db
      .selectFrom('apiKeys')
      .selectAll()
      .where('keyHash', '=', keyHash)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!apiKey) {
      throw new UnauthorizedException('API Key 不存在或已被撤销');
    }

    // 检查是否过期
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      throw new UnauthorizedException('API Key 已过期');
    }

    // 异步更新最后使用时间（不阻塞响应）
    this.db
      .updateTable('apiKeys')
      .set({ lastUsedAt: new Date() })
      .where('keyHash', '=', keyHash)
      .execute()
      .catch(() => {});

    const user = await this.userRepo.findById(apiKey.creatorId, apiKey.workspaceId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const workspace = await this.workspaceRepo.findById(apiKey.workspaceId);
    if (!workspace) {
      throw new UnauthorizedException('工作空间不存在');
    }

    return { user, workspace };
  }

  /**
   * 列出 API Key（支持分页和管理员全量视图）
   * 游标使用 createdAt ISO 字符串，与 DESC 排序方向一致
   * 注意：不返回 keyHash 字段（安全考虑）
   */
  async list(
    userId: string,
    workspaceId: string,
    pagination: PaginationOptions,
    adminView = false,
  ): Promise<any> {
    let query = this.db
      .selectFrom('apiKeys')
      .leftJoin('users', 'users.id', 'apiKeys.creatorId')
      .select([
        'apiKeys.id',
        'apiKeys.name',
        'apiKeys.creatorId',
        'apiKeys.workspaceId',
        'apiKeys.expiresAt',
        'apiKeys.lastUsedAt',
        'apiKeys.createdAt',
        'apiKeys.updatedAt',
        'users.id as userId',
        'users.name as userName',
        'users.email as userEmail',
        'users.avatarUrl as userAvatarUrl',
      ])
      .where('apiKeys.workspaceId', '=', workspaceId)
      .where('apiKeys.deletedAt', 'is', null);

    if (!adminView) {
      query = query.where('apiKeys.creatorId', '=', userId);
    }

    query = query.orderBy('apiKeys.createdAt', 'desc');

    const limit = pagination?.limit ?? 20;
    const cursor = pagination?.cursor;

    if (cursor) {
      query = query.where('apiKeys.createdAt', '<', new Date(cursor));
    }

    const items = await query.limit(limit + 1).execute();
    const hasNextPage = items.length > limit;
    if (hasNextPage) items.pop();

    const nextCursor = hasNextPage
      ? (items[items.length - 1]?.createdAt as Date)?.toISOString()
      : undefined;

    const mappedItems = items.map((item) => ({
      id: item.id,
      name: item.name,
      creatorId: item.creatorId,
      workspaceId: item.workspaceId,
      expiresAt: item.expiresAt,
      lastUsedAt: item.lastUsedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      creator: {
        id: item.userId,
        name: item.userName,
        email: item.userEmail,
        avatarUrl: item.userAvatarUrl,
      },
    }));

    return {
      items: mappedItems,
      meta: { hasNextPage, hasPrevPage: !!cursor, nextCursor },
    };
  }

  /**
   * 更新 API Key 名称
   * 只有创建者或管理员（owner/admin）可以操作
   * 注意：重命名不影响 key_hash，原始 token 继续有效
   */
  async update(
    dto: UpdateApiKeyDto,
    userId: string,
    workspaceId: string,
    userRole?: string,
  ): Promise<any> {
    const apiKey = await this.db
      .selectFrom('apiKeys')
      .selectAll()
      .where('id', '=', dto.apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }

    const isAdmin = userRole === UserRole.OWNER || userRole === UserRole.ADMIN;
    if (apiKey.creatorId !== userId && !isAdmin) {
      throw new ForbiddenException('无权操作此 API Key');
    }

    return this.db
      .updateTable('apiKeys')
      .set({ name: dto.name, updatedAt: new Date() })
      .where('id', '=', dto.apiKeyId)
      .returning([
        'id',
        'name',
        'creatorId',
        'workspaceId',
        'expiresAt',
        'lastUsedAt',
        'createdAt',
        'updatedAt',
      ])
      .executeTakeFirst();
  }

  /**
   * 撤销 API Key（软删除）
   * 只有创建者或管理员（owner/admin）可以操作
   * 撤销后立即生效——下次验证查询 WHERE deleted_at IS NULL 不命中
   */
  async revoke(
    apiKeyId: string,
    userId: string,
    workspaceId: string,
    userRole?: string,
  ): Promise<void> {
    const apiKey = await this.db
      .selectFrom('apiKeys')
      .selectAll()
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }

    const isAdmin = userRole === UserRole.OWNER || userRole === UserRole.ADMIN;
    if (apiKey.creatorId !== userId && !isAdmin) {
      throw new ForbiddenException('无权撤销此 API Key');
    }

    await this.db
      .updateTable('apiKeys')
      .set({ deletedAt: new Date() })
      .where('id', '=', apiKeyId)
      .execute();
  }
}

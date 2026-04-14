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
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { UserRole } from '../../common/helpers/types/permission';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  /**
   * 创建 API Key：插入记录获取 id → 生成 JWT
   * 返回的 token 只有此时可以查看，后续不再返回原始 token
   */
  async create(
    dto: CreateApiKeyDto,
    user: User,
    workspace: Workspace,
  ): Promise<any> {
    // 插入记录获取 id（使用 camelCase 列名，CamelCasePlugin 会自动映射到 snake_case）
    const apiKeyRecord = await this.db
      .insertInto('apiKeys')
      .values({
        name: dto.name,
        creatorId: user.id,
        workspaceId: workspace.id,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
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

    return {
      id: apiKeyRecord.id,
      name: apiKeyRecord.name,
      token, // 仅此一次返回原始 token
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
   * 验证 API Key（由 JwtStrategy 调用）
   * 通过 JWT payload 中的 apiKeyId 查询记录，校验有效性
   */
  async validateApiKey(payload: JwtApiKeyPayload): Promise<{ user: any; workspace: any }> {
    const { sub: userId, workspaceId, apiKeyId } = payload;

    const apiKey = await this.db
      .selectFrom('apiKeys')
      .selectAll()
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', userId)
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
   * 列出 API Key（支持分页和管理员全量视图）
   * 游标使用 createdAt ISO 字符串，与 DESC 排序方向一致
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

    // 非管理员视图：只看自己的
    if (!adminView) {
      query = query.where('apiKeys.creatorId', '=', userId);
    }

    // 按创建时间降序（最新在前）
    query = query.orderBy('apiKeys.createdAt', 'desc');

    const limit = pagination?.limit ?? 20;
    const cursor = pagination?.cursor; // cursor 为上一页最后一条的 createdAt ISO 字符串

    // 游标筛选：取比上一条更旧的记录（与 DESC 排序方向一致）
    if (cursor) {
      query = query.where('apiKeys.createdAt', '<', new Date(cursor));
    }

    const items = await query.limit(limit + 1).execute();
    const hasNextPage = items.length > limit;
    if (hasNextPage) items.pop();

    // nextCursor 存储最后一条的 createdAt ISO 字符串，用于下次分页
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
      meta: {
        hasNextPage,
        hasPrevPage: !!cursor,
        nextCursor,
      },
    };
  }

  /**
   * 更新 API Key 名称
   * 只有创建者或管理员（owner/admin）可以操作
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

    // 管理员（owner/admin）可以操作所有人的 API Key
    const isAdmin = userRole === UserRole.OWNER || userRole === UserRole.ADMIN;
    if (apiKey.creatorId !== userId && !isAdmin) {
      throw new ForbiddenException('无权操作此 API Key');
    }

    const updated = await this.db
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

    return updated;
  }

  /**
   * 撤销 API Key（软删除）
   * 只有创建者或管理员（owner/admin）可以操作
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

    // 管理员（owner/admin）可以撤销所有人的 API Key
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

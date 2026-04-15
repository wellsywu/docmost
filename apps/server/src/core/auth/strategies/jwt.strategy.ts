import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { JwtPayload, JwtType } from '../dto/jwt-payload';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { SessionActivityService } from '../../session/session-activity.service';
import { FastifyRequest } from 'fastify';
import { extractBearerTokenFromHeader, isUserDisabled } from '../../../common/helpers';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private logger = new Logger('JwtStrategy');

  constructor(
    private userRepo: UserRepo,
    private workspaceRepo: WorkspaceRepo,
    private userSessionRepo: UserSessionRepo,
    private sessionActivityService: SessionActivityService,
    private readonly environmentService: EnvironmentService,
  ) {
    super({
      jwtFromRequest: (req: FastifyRequest) => {
        const bearer = extractBearerTokenFromHeader(req);
        // dm_sk_ 开头的 token 由 ApiKeyStrategy 处理，JWT Strategy 跳过
        if (bearer?.startsWith('dm_sk_')) return null;
        return req.cookies?.authToken || bearer;
      },
      ignoreExpiration: false,
      secretOrKey: environmentService.getAppSecret(),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload) {
    if (!payload.workspaceId) {
      throw new UnauthorizedException();
    }

    if (req.raw.workspaceId && req.raw.workspaceId !== payload.workspaceId) {
      throw new UnauthorizedException('Workspace does not match');
    }

    // API_KEY 类型由独立的 ApiKeyStrategy 处理，此处仅处理 ACCESS 类型
    if (payload.type !== JwtType.ACCESS) {
      throw new UnauthorizedException();
    }

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);
    if (!workspace) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    if ((payload as JwtPayload).sessionId) {
      const sessionId = (payload as JwtPayload).sessionId;
      const session = await this.userSessionRepo.findActiveById(sessionId);
      if (!session || session.userId !== payload.sub || session.workspaceId !== payload.workspaceId) {
        throw new UnauthorizedException();
      }
      req.raw.sessionId = sessionId;
      this.sessionActivityService.trackActivity(sessionId, payload.sub, payload.workspaceId);
    }

    return { user, workspace };
  }

}

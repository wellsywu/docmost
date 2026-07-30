import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { extractBearerTokenFromHeader } from '../../../common/helpers';
import { MdSessionService } from './md-session.service';

export const MD_SESSION_REQUEST_KEY = 'mdSession';

@Injectable()
export class MdSessionGuard implements CanActivate {
  constructor(private readonly sessions: MdSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Missing md session');
    }

    request[MD_SESSION_REQUEST_KEY] = await this.sessions.validate(token);
    return true;
  }
}

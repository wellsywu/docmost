import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { extractBearerTokenFromHeader } from '../../../common/helpers';
import { DoocsSessionService } from './doocs-session.service';

export const DOOCS_SESSION_REQUEST_KEY = 'doocsSession';

@Injectable()
export class DoocsSessionGuard implements CanActivate {
  constructor(private readonly sessions: DoocsSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Missing md session');
    }

    request[DOOCS_SESSION_REQUEST_KEY] = await this.sessions.validate(token);
    return true;
  }
}

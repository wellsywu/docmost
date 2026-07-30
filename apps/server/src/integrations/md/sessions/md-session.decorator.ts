import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { MdSessionPrincipal } from './md-session.service';
import { MD_SESSION_REQUEST_KEY } from './md-session.guard';

export const MdSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MdSessionPrincipal =>
    context.switchToHttp().getRequest()[MD_SESSION_REQUEST_KEY],
);

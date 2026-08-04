import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DoocsSessionPrincipal } from './doocs-session.service';
import { DOOCS_SESSION_REQUEST_KEY } from './doocs-session.guard';

export const DoocsSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DoocsSessionPrincipal =>
    context.switchToHttp().getRequest()[DOOCS_SESSION_REQUEST_KEY],
);

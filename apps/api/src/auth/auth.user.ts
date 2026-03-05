import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './jwt.guard';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as AuthUser;
});

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export type AuthUser = {
  id: string;
  phone?: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const header = (req.headers['authorization'] ?? req.headers['Authorization']) as string | undefined;
    if (!header) throw new UnauthorizedException('NO_AUTH');

    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('BAD_AUTH');

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      });

      req.user = {
        id: payload.sub,
        phone: payload.phone,
      } satisfies AuthUser;

      return true;
    } catch {
      throw new UnauthorizedException('INVALID_TOKEN');
    }
  }
}

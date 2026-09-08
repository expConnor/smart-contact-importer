import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app.error';
import { COOKIE_NAME } from './cookie';
import { TokenService } from './token.service';
import type { AuthenticatedRequest } from './types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // express types req.cookies as `any`; cast once so the lookup is checked.
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const token = cookies[COOKIE_NAME];
    if (!token) throw new AppError('UNAUTHORIZED');

    try {
      const payload = this.tokens.verify(token);
      req.user = { userId: payload.sub };
    } catch {
      // Expired, tampered, or signed with another secret — all one answer.
      throw new AppError('UNAUTHORIZED');
    }

    return true;
  }
}

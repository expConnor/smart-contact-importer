import { Controller, Get } from '@nestjs/common';
import { AppError } from './common/errors/app.error';
import { CurrentUser } from './auth/decorators/current-user.decorator';
import { PrismaService } from './prisma/prisma.service';
import type { PublicUser } from './auth/types';

@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    // Signature was valid but the row is gone.
    if (!user) throw new AppError('UNAUTHORIZED');

    return { id: user.id, email: user.email };
  }
}

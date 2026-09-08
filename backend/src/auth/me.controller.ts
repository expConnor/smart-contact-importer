import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppError } from '../common/errors/app.error';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import type { PublicUser } from './types';

@UseGuards(JwtAuthGuard)
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

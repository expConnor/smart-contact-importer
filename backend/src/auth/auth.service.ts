import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthUser } from './auth.types';
import { AppError } from '../common/errors/app.error';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new AppError('UNAUTHORIZED');
    }
    const authUser: AuthUser = { email: user.email, token: 'abc123' };

    return authUser;
  }
}

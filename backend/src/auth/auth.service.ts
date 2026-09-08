import { Injectable } from '@nestjs/common';
import { verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app.error';
import { LoginDto } from './dto/login.dto';
import { TokenService } from './token.service';
import type { PublicUser } from './types';

// A real argon2id digest over a random password nobody holds, built with the
// HASH_OPTIONS in prisma/seed.ts. Verifying against it costs what a real user
// costs, so an unknown email cannot be told from a wrong password by latency.
const THROWAWAY_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$F3TIib4CAl1Z+t3p7S01Fg$o3lOwU6+2S2/LWyCvsbHc5wJ4vnMdZCYWFHlDgP/M9o';

export type LoginResult = {
  user: PublicUser;
  token: string;
  expiresAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      await verify(THROWAWAY_HASH, dto.password);
      throw new AppError('UNAUTHORIZED');
    }

    const ok = await verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new AppError('UNAUTHORIZED');
    }

    const { token, expiresAt } = this.tokens.sign(user.id);

    return { user: { id: user.id, email: user.email }, token, expiresAt };
  }
}

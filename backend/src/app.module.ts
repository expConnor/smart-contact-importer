import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AppErrorFilter } from './common/errors/app-error.filter';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { MeController } from './me.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MeController],
  providers: [
    { provide: APP_FILTER, useClass: AppErrorFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}

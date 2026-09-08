import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AppErrorFilter } from './common/errors/app-error.filter';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [{ provide: APP_FILTER, useClass: AppErrorFilter }],
})
export class AppModule {}

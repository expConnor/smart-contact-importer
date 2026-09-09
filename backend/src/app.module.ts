import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AppErrorFilter } from './common/errors/app-error.filter';
import { ContactsModule } from './contacts/contacts.module';

@Module({
  imports: [PrismaModule, AuthModule, ContactsModule],
  providers: [{ provide: APP_FILTER, useClass: AppErrorFilter }],
})
export class AppModule {}

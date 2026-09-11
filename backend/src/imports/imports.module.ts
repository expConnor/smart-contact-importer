import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { CSV_UPLOAD_OPTIONS, ImportsStorage } from './storage';

@Module({
  // AuthModule exports TokenService, which JwtAuthGuard needs — the guard
  // supplies the userId half of (userId, idempotencyKey).
  imports: [AuthModule, MulterModule.register(CSV_UPLOAD_OPTIONS)],
  controllers: [ImportsController],
  providers: [ImportsService, ImportsStorage],
})
export class ImportsModule {}

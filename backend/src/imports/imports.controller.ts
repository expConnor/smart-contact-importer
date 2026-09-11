import {
  Controller,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ImportsService } from './imports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IdempotencyKeyGuard } from './guards/idempotency-key.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IdempotencyKey } from './decorators/idempotency-key.decorator';
import { CreateImportResponseDto } from './dto/create-import-response.dto';
import { CreateImportResult } from './types';
import { type Response } from 'express';

@Controller({ path: 'imports', version: '1' })
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('/')
  @UseGuards(IdempotencyKeyGuard)
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser() userId: string,
    @IdempotencyKey() idempotencyKey: string,
    @UploadedFile() file: Express.Multer.File,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateImportResponseDto> {
    const importResult: CreateImportResult = await this.importsService.create(
      userId,
      idempotencyKey,
      file,
    );
    res.statusCode = importResult.replayed ? 200 : 201;

    return { id: importResult.id };
  }
}

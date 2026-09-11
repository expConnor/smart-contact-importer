import {
  Controller,
  Post,
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

@Controller({ path: 'imports', version: '1' })
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('/')
  @UseGuards(JwtAuthGuard, IdempotencyKeyGuard)
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser() _userId: string,
    @IdempotencyKey() _idempotencyKey: string,
    @UploadedFile() _file: Express.Multer.File,
  ): Promise<CreateImportResponseDto> {
    return await this.importsService.create();
  }
}

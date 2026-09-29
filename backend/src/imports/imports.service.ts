import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/errors/app.error';
import type { ImportJob } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImportsStorage } from './storage';
import {
  assertCsvPresent,
  isIdempotencyConflict,
  isRecordNotFound,
} from './imports.rules';
import { validateMapping } from './analysis/validate';
import type { CreateImportResult } from './types';
import { ImportJobResponseDto } from './dto/import-job-response.dto';
import { ListImportsResponseDto } from './dto/list-imports-response.dto';
import { toImportJobResponseDto } from './import-job.mapper';

type StoredHeaders = { headers: string[] };

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImportsStorage,
  ) {}

  async create(
    userId: string,
    idempotencyKey: string,
    file: Express.Multer.File | undefined,
  ): Promise<CreateImportResult> {
    let committed = false;
    try {
      assertCsvPresent(file);
      const result = await this.persist(userId, idempotencyKey, file);
      committed = !result.replayed;
      return result;
    } finally {
      if (!committed && file) {
        await this.storage.discard(file.filename);
      }
    }
  }

  // Only the columns the sidebar shows: the select is the DTO. id breaks
  // createdAt ties so the order holds steady between polls.
  async findAll(userId: string): Promise<ListImportsResponseDto> {
    const items = await this.prisma.importJob.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true, status: true, originalFilename: true },
    });
    return { items };
  }

  async findOne(userId: string, id: string): Promise<ImportJobResponseDto> {
    const job = await this.findOwned(userId, id);
    const errors = await this.prisma.importError.findMany({
      where: { importJobId: id },
      orderBy: { rowNumber: 'asc' },
      take: 100,
      select: { rowNumber: true, field: true, message: true, rawRow: true },
    });
    return toImportJobResponseDto(job, errors);
  }

  async confirmMapping(
    userId: string,
    id: string,
    body: unknown,
  ): Promise<ImportJobResponseDto> {
    const job = await this.findOwned(userId, id);
    if (job.status !== 'AWAITING_MAPPING') {
      throw new AppError('CONFLICT');
    }

    const result = validateMapping(
      {
        headers: (job.detectedHeaders as StoredHeaders | null)?.headers ?? [],
        headerRowIndex: job.headerRowIndex ?? -1,
      },
      body,
    );
    if (!result.ok) {
      throw new AppError('MAPPING_INVALID', result.issues);
    }

    try {
      const updated = await this.prisma.importJob.update({
        where: { id, status: 'AWAITING_MAPPING' },
        data: {
          status: 'PENDING_IMPORT',
          confirmedMapping: { mappings: result.mapping.mappings },
        },
      });
      // A job only gains errors once it is imported.
      return toImportJobResponseDto(updated, []);
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new AppError('CONFLICT');
      }
      throw error;
    }
  }

  // Another user's job answers exactly like an unknown id: a 403 would confirm
  // the id exists.
  private async findOwned(userId: string, id: string): Promise<ImportJob> {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job || job.userId !== userId) {
      throw new AppError('NOT_FOUND');
    }
    return job;
  }

  // Insert first and arbitrate the violation, rather than read-then-insert:
  // two concurrent requests carrying the same key both miss the read, so the
  // P2002 path has to exist regardless. This way it is the only path.
  private async persist(
    userId: string,
    idempotencyKey: string,
    file: Express.Multer.File,
  ): Promise<CreateImportResult> {
    const fileHash = await this.storage.hashFile(file.path);

    try {
      const job = await this.prisma.importJob.create({
        data: {
          userId,
          idempotencyKey,
          fileHash,
          originalFilename: file.originalname,
          storagePath: file.filename,
          byteSize: file.size,
        },
      });
      return { id: job.id, replayed: false };
    } catch (error) {
      if (!isIdempotencyConflict(error)) {
        throw error;
      }
      return this.arbitrate(userId, idempotencyKey, fileHash);
    }
  }

  // Same key, same bytes: the original job, replayed. Same key, different
  // bytes: the client spent that key on another file — a 409, not a 500.
  private async arbitrate(
    userId: string,
    idempotencyKey: string,
    fileHash: string,
  ): Promise<CreateImportResult> {
    const existing = await this.prisma.importJob.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });

    if (!existing) {
      this.logger.error(
        `P2002 on ${idempotencyKey} for user ${userId}, but no job survives`,
      );
      throw new AppError('INTERNAL');
    }

    if (existing.fileHash !== fileHash) {
      throw new AppError('CONFLICT', [
        {
          field: 'Idempotency-Key',
          message: 'Key was already used for a different file',
        },
      ]);
    }

    this.logger.log(`Replayed import ${existing.id} for user ${userId}`);
    return { id: existing.id, replayed: true };
  }
}

import { createReadStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { basename, extname, join, resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { env } from '../config/env';
import { AppError } from '../common/errors/app.error';

export const UPLOAD_DIR = resolve(env.UPLOAD_DIR);

// Never the client's filename: it is attacker-controlled and collides. This is
// what lands in storagePath; originalname is kept as originalFilename, for
// display only.
const csvDiskStorage = diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, _file, callback) => {
    callback(null, `${randomUUID()}.csv`);
  },
});

// Extension, not mimetype: one .csv arrives as text/csv, as
// application/vnd.ms-excel, or as application/octet-stream depending on the
// client OS and what owns the extension there. Exported so the rejection can be
// tested by calling it, without booting Nest to send a multipart request.
// AppError extends HttpException, so Nest's transformException passes it
// through untouched.
export const acceptCsvOnly: NonNullable<MulterOptions['fileFilter']> = (
  _req,
  file,
  callback,
) => {
  if (extname(file.originalname).toLowerCase() !== '.csv') {
    callback(
      new AppError('VALIDATION_FAILED', [
        { field: 'file', message: 'File must be a .csv' },
      ]),
      false,
    );
    return;
  }
  callback(null, true);
};

// A plain value, not a provider, for the same reason UPLOAD_DIR is one:
// MulterModule resolves these inside its own injector.
export const CSV_UPLOAD_OPTIONS: MulterOptions = {
  storage: csvDiskStorage,
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: acceptCsvOnly,
};

@Injectable()
export class ImportsStorage implements OnModuleInit {
  private readonly logger = new Logger(ImportsStorage.name);

  async onModuleInit(): Promise<void> {
    await this.ensureUploadDir();
  }

  // No try/catch on purpose: EACCES / EROFS / ENOSPC must abort boot, not
  // resurface as a 500 on someone's first upload. recursive:true is idempotent.
  async ensureUploadDir(): Promise<void> {
    await mkdir(UPLOAD_DIR, { recursive: true });
    this.logger.log(`Upload directory ready: ${UPLOAD_DIR}`);
  }

  // Streamed, not readFile — a 10 MiB buffer per request is the exact thing
  // diskStorage exists to avoid. Errors propagate: if we cannot hash the file
  // we do not know what we stored, so the row must not be written.
  async hashFile(path: string): Promise<string> {
    const hash = createHash('sha256');
    await pipeline(createReadStream(path), hash);
    return hash.digest('hex');
  }

  async discard(filename: string): Promise<void> {
    const target = join(UPLOAD_DIR, basename(filename));

    try {
      await rm(target, { force: true });
    } catch (error) {
      this.logger.error(
        `Leaked upload ${filename}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

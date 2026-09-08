import { HttpException } from '@nestjs/common';
import { CATALOGUE } from './error-catalogue';
import type { ErrorCode } from './error-catalogue';

export class AppError extends HttpException {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, details?: unknown, message?: string) {
    const entry = CATALOGUE[code];
    super(message ?? entry.message, entry.status);
    this.code = code;
    this.details = details;
  }
}

import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from './app.error';
import { CATALOGUE, STATUS_TO_CODE } from './error-catalogue';
import type { ErrorBody, ErrorCode } from './error-catalogue';

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const { status, body } = this.describe(exception);
    const where = `${req.method} ${req.originalUrl}`;

    if (exception instanceof HttpException) {
      this.logger.warn(`${where} -> ${status} ${body.error.code}`);
    } else {
      this.logger.error(
        `${where} -> 500 INTERNAL`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(body);
  }

  private describe(exception: unknown): { status: number; body: ErrorBody } {
    // 1 — ours: status and default message come from the catalogue.
    if (exception instanceof AppError) {
      return {
        status: CATALOGUE[exception.code].status,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details,
          },
        },
      };
    }

    // 2 — framework/library: keep its status, only supply a code. Using
    // CATALOGUE[code].status here would relabel a router 404 as a 500.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ErrorCode = STATUS_TO_CODE[status] ?? 'INTERNAL';
      return {
        status,
        body: { error: { code, message: CATALOGUE[code].message } },
      };
    }

    // 3 — unknown: nothing from the exception reaches the body.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: { code: 'INTERNAL', message: CATALOGUE.INTERNAL.message },
      },
    };
  }
}

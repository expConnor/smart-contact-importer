import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppError } from '../../common/errors/app.error';

export const IDEMPOTENCY_KEY = Symbol('idempotency-key');

declare module 'express' {
  interface Request {
    [IDEMPOTENCY_KEY]?: string;
  }
}

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,255}$/;

@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    request[IDEMPOTENCY_KEY] = parseKey(request.headers['idempotency-key']);
    return true;
  }
}

function parseKey(raw: string | string[] | undefined): string {
  if (raw === undefined) {
    fail('Idempotency-Key is missing');
  }
  if (Array.isArray(raw)) {
    fail('Idempotency-Key must be sent exactly once');
  }

  const key = raw.trim();
  if (!KEY_PATTERN.test(key)) {
    fail('Idempotency-Key must be 8-255 characters of [A-Za-z0-9_.:-]');
  }
  return key;
}

function fail(message: string): never {
  throw new AppError('VALIDATION_FAILED', [
    { field: 'Idempotency-Key', message },
  ]);
}

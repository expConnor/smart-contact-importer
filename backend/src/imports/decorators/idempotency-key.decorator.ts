import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { IDEMPOTENCY_KEY } from '../guards/idempotency-key.guard';

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const key = context.switchToHttp().getRequest<Request>()[IDEMPOTENCY_KEY];
    if (key === undefined) {
      throw new Error('IdempotencyKeyGuard is missing from this route');
    }
    return key;
  },
);

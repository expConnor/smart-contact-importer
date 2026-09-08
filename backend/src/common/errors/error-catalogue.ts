import { HttpStatus } from '@nestjs/common';

export const CATALOGUE = {
  VALIDATION_FAILED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Request validation failed',
  },
  UNAUTHORIZED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Invalid credentials',
  },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Not found' },
  INTERNAL: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  },
} satisfies Record<string, { status: HttpStatus; message: string }>;

export type ErrorCode = keyof typeof CATALOGUE;
export type FieldError = { field: string; message: string };
export type ErrorBody = {
  error: { code: ErrorCode; message: string; details?: unknown };
};

// Branch 2 only: the thrown status is kept, this supplies the code.
export const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  500: 'INTERNAL',
};

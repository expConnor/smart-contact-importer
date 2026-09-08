import type { ValidationPipeOptions } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { AppError } from './app.error';
import type { FieldError } from './error-catalogue';

function toFieldErrors(errors: ValidationError[]): FieldError[] {
  return errors.flatMap((e) =>
    Object.values(e.constraints ?? {}).map((message) => ({
      field: e.property,
      message,
    })),
  );
}

export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors: ValidationError[]) =>
    new AppError('VALIDATION_FAILED', toFieldErrors(errors)),
};

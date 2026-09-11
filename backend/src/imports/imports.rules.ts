import { AppError } from '../common/errors/app.error';
import { Prisma } from '../generated/prisma/client';

export function assertCsvPresent(
  file: Express.Multer.File | undefined,
): asserts file is Express.Multer.File {
  if (!file) {
    fail('File is missing');
  }
  if (file.size === 0) {
    fail('File cannot be empty');
  }
}

const IDEMPOTENCY_FIELD = 'idempotencyKey';

export function isIdempotencyConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const named = violatedConstraint(error.meta);

  // Unnamed: the adapter did not report which constraint fired. ImportJob has
  // exactly one unique constraint besides its primary key, and the findUnique
  // in arbitrate() is authoritative anyway — let it decide.
  return named === undefined || named.includes(IDEMPOTENCY_FIELD);
}

// Prisma 7 routes Postgres errors through the driver adapter, which leaves
// meta.target undefined and names the constraint under
// meta.driverAdapterError.cause.constraint — as { index } for a named unique
// index, as { fields } otherwise. Both are optional, hence the undefined case.
function violatedConstraint(meta: unknown): string | undefined {
  const cause = pick(pick(meta, 'driverAdapterError'), 'cause');
  const constraint = pick(cause, 'constraint');
  if (constraint === undefined) {
    return undefined;
  }

  const index = pick(constraint, 'index');
  if (typeof index === 'string') {
    return index;
  }

  const fields = pick(constraint, 'fields');
  if (Array.isArray(fields)) {
    return fields.join(',');
  }

  return undefined;
}

function pick(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function fail(message: string): never {
  throw new AppError('VALIDATION_FAILED', [{ field: 'file', message }]);
}

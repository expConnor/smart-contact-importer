import { AppError } from '../errors/app.error';
import { FieldError } from '../errors/error-catalogue';
import { SortParam, sortParams } from './sort';
import { Buffer } from 'buffer';

export type Cursor<C extends string> = {
  id: string;
  sort: SortParam<C>;
};

const CURSOR_ERROR: FieldError[] = [
  { field: 'cursor', message: 'cursor is not a valid pagination cursor' },
];

export function encodeCursor<C extends string>(cursor: Cursor<C>): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor<C extends string>(
  raw: string,
  cols: readonly C[],
): Cursor<C> {
  const payload = parsePayload(raw);

  if (!isCursor(payload, cols)) {
    throw new AppError('VALIDATION_FAILED', CURSOR_ERROR);
  }

  return payload;
}

function parsePayload(raw: string): unknown {
  try {
    return JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as unknown;
  } catch {
    throw new AppError('VALIDATION_FAILED', CURSOR_ERROR);
  }
}

function isCursor<C extends string>(
  value: unknown,
  cols: readonly C[],
): value is Cursor<C> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { id, sort } = value as Record<string, unknown>;

  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof sort === 'string' &&
    (sortParams(cols) as readonly string[]).includes(sort)
  );
}

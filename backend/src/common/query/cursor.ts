import { AppError } from '../errors/app.error';
import { FieldError } from '../errors/error-catalogue';
import { Filter, filtersEqual, FilterSpec } from './filter';
import { SortParam, sortParams, SortSpec, toSortParam } from './sort';
import { Buffer } from 'buffer';

export type Cursor<C extends string, F extends string> = {
  id: string;
  sort: SortParam<C>;
  filters: FilterSpec<F>;
};

const CURSOR_ERROR: FieldError[] = [
  { field: 'cursor', message: 'cursor is not a valid pagination cursor' },
];

const SORT_MISMATCH: FieldError[] = [
  { field: 'cursor', message: 'cursor was issued for a different sort' },
];
const FILTER_MISMATCH: FieldError[] = [
  { field: 'cursor', message: 'cursor was issued for a different filter' },
];

// A forged cursor can only name a row id and a sort, and decodeCursor validates
// the sort against `cols` before it is trusted.
export function encodeCursor<C extends string, F extends string>(
  cursor: Cursor<C, F>,
): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor<C extends string, F extends string>(
  raw: string,
  cols: readonly C[],
  filterCols: readonly F[],
): Cursor<C, F> {
  const payload = parsePayload(raw);

  if (!isCursor(payload, cols, filterCols)) {
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

function isCursor<C extends string, F extends string>(
  value: unknown,
  sortCols: readonly C[],
  filterCols: readonly F[],
): value is Cursor<C, F> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { id, sort, filters } = value as Record<string, unknown>;

  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof sort === 'string' &&
    (sortParams(sortCols) as readonly string[]).includes(sort) &&
    isFilterSpec(filters, filterCols)
  );
}

// The decoded filters are only ever compared against the request's own filters —
// they never build a where clause. This checks shape so the predicate above is
// honest about the type, not to make the values safe for SQL.
function isFilterSpec<F extends string>(
  value: unknown,
  cols: readonly F[],
): value is FilterSpec<F> {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => isFilter(entry, cols))
  );
}

function isFilter<F extends string>(
  value: unknown,
  cols: readonly F[],
): value is Filter<F> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { column, value: filterValue } = value as Record<string, unknown>;

  return (
    typeof column === 'string' &&
    (cols as readonly string[]).includes(column) &&
    typeof filterValue === 'string' &&
    filterValue.length > 0
  );
}

// Prisma's `cursor` is inclusive: the row it names is the first row of this
// page, not the last row of the previous one. That is why callers withhold the
// probe row instead of adding `skip: 1`.
export function toPageAnchor<C extends string, F extends string>(
  cursor: Cursor<C, F> | null,
): { id: string } | undefined {
  return cursor ? { id: cursor.id } : undefined;
}

// A cursor is an anchor into one specific ordering of one specific result set.
// If the client changes `sort` or a filter mid-pagination the anchor is
// meaningless, so reject it rather than silently re-anchoring into the new order.
export function assertCursorMatches<C extends string, F extends string>(
  cursor: Cursor<C, F> | null,
  sort: SortSpec<C>,
  filters: FilterSpec<F>,
): void {
  if (!cursor) return;

  if (!filtersEqual(cursor.filters, filters)) {
    throw new AppError('VALIDATION_FAILED', FILTER_MISMATCH);
  }

  if (cursor.sort !== toSortParam(sort)) {
    throw new AppError('VALIDATION_FAILED', SORT_MISMATCH);
  }
}

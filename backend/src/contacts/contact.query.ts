import { Contact, Prisma } from '../generated/prisma/client';
import { parseSort, toSortParam } from '../common/query/sort';
import type { SortParam, SortSpec } from '../common/query/sort';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { Cursor, decodeCursor, encodeCursor } from '../common/query/cursor';
import { FieldError } from '../common/errors/error-catalogue';
import { AppError } from '../common/errors/app.error';
import { FilterSpec, parseFilters } from '../common/query/filter';

export const CONTACT_SORT_COLUMNS = ['createdAt', 'name', 'company'] as const;
export const CONTACT_FILTER_COLUMNS = ['status', 'company'] as const;
export const CONTACT_STATUSES = [
  'active',
  'bounced',
  'dormant',
  'lead',
] as const;

export type ContactSortColumn = (typeof CONTACT_SORT_COLUMNS)[number];
export type ContactFilterColumn = (typeof CONTACT_FILTER_COLUMNS)[number];
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const DEFAULT_CONTACT_SORT: SortParam<ContactSortColumn> = '-createdAt';
export const DEFAULT_CONTACT_LIMIT: number = 50;

const SORT_MISMATCH: FieldError[] = [
  { field: 'cursor', message: 'cursor was issued for a different sort' },
];

export type ContactListQuery = {
  sort: SortSpec<ContactSortColumn>;
  filters: FilterSpec<ContactFilterColumn>;
  limit: number;
  cursor: Cursor<ContactSortColumn> | null;
};

export function toContactListQuery(
  dto: ListContactsQueryDto,
): ContactListQuery {
  const sort = parseSort(dto.sort, DEFAULT_CONTACT_SORT);
  const cursor = dto.cursor
    ? decodeCursor<ContactSortColumn>(dto.cursor, CONTACT_SORT_COLUMNS)
    : null;

  const filters = parseFilters(CONTACT_FILTER_COLUMNS, dto);

  // A cursor is an anchor into one specific ordering. If the client changes `sort`
  // mid-pagination the anchor is meaningless, so reject it rather than silently
  // re-anchoring into the new order.
  if (cursor && cursor.sort !== toSortParam(sort)) {
    throw new AppError('VALIDATION_FAILED', SORT_MISMATCH);
  }

  return {
    sort,
    filters,
    limit: dto.limit ?? DEFAULT_CONTACT_LIMIT,
    cursor,
  };
}

export function toOrderBy(
  spec: SortSpec<ContactSortColumn>,
): Prisma.ContactOrderByWithRelationInput[] {
  return [{ [spec.column]: spec.direction }, { id: spec.direction }];
}

export function toNextCursor(
  row: Pick<Contact, 'id'>,
  sort: SortSpec<ContactSortColumn>,
): string {
  return encodeCursor<ContactSortColumn>({
    id: row.id,
    sort: toSortParam(sort),
  });
}

export function toPageStart(
  cursor: Cursor<ContactSortColumn> | null,
): Pick<Prisma.ContactFindManyArgs, 'cursor'> {
  return cursor ? { cursor: { id: cursor.id } } : {};
}

// mode: 'insensitive' makes Prisma emit ILIKE, so `%` and `_` in a client-supplied
// value act as wildcards — ?company=% matched every row. Backslash is ILIKE's
// default escape character, so escaping keeps an equality filter an equality filter.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function toWhere(
  spec: FilterSpec<ContactFilterColumn>,
): Pick<Prisma.ContactFindManyArgs, 'where'> {
  const clauses: Prisma.ContactWhereInput = {};

  for (const clause of spec) {
    clauses[clause.column] = {
      equals: escapeLike(clause.value),
      mode: 'insensitive',
    };
  }

  return { where: clauses };
}

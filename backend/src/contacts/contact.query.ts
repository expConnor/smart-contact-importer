import { Contact, Prisma } from '../generated/prisma/client';
import { parseSort, toSortParam } from '../common/query/sort';
import type { SortParam, SortSpec } from '../common/query/sort';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { Cursor, decodeCursor, encodeCursor } from '../common/query/cursor';
import { FieldError } from '../common/errors/error-catalogue';
import { AppError } from '../common/errors/app.error';

export const CONTACT_SORT_COLUMNS = ['createdAt', 'name', 'company'] as const;

export type ContactSortColumn = (typeof CONTACT_SORT_COLUMNS)[number];

export const DEFAULT_CONTACT_SORT: SortParam<ContactSortColumn> = '-createdAt';
export const DEFAULT_CONTACT_LIMIT: number = 50;

const SORT_MISMATCH: FieldError[] = [
  { field: 'cursor', message: 'cursor was issued for a different sort' },
];

export type ContactListQuery = {
  sort: SortSpec<ContactSortColumn>;
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

  if (cursor && cursor.sort !== toSortParam(sort)) {
    throw new AppError('VALIDATION_FAILED', SORT_MISMATCH);
  }

  return {
    sort,
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

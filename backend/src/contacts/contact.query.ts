import { Contact, Prisma } from '../generated/prisma/client';
import { parseSort, toSortParam } from '../common/query/sort';
import type { SortParam, SortSpec } from '../common/query/sort';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { encodeCursor } from '../common/query/cursor';

export const CONTACT_SORT_COLUMNS = ['createdAt', 'name', 'company'] as const;

export type ContactSortColumn = (typeof CONTACT_SORT_COLUMNS)[number];

export const DEFAULT_CONTACT_SORT: SortParam<ContactSortColumn> = '-createdAt';
export const DEFAULT_CONTACT_LIMIT: number = 50;

export type ContactListQuery = {
  sort: SortSpec<ContactSortColumn>;
  limit: number;
};

export function toContactListQuery(
  dto: ListContactsQueryDto,
): ContactListQuery {
  return {
    sort: parseSort(dto.sort, DEFAULT_CONTACT_SORT),
    limit: dto.limit ?? DEFAULT_CONTACT_LIMIT,
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

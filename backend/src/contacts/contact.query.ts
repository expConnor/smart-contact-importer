import { Contact } from '../generated/prisma/client';
import { encodeCursor } from '../common/query/cursor';
import { FilterSpec } from '../common/query/filter';
import { SortSpec, toSortParam } from '../common/query/sort';
import { ListQuery, QuerySpec, toListQuery } from '../common/query/list-query';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';

export const CONTACT_SORT_COLUMNS = ['createdAt', 'name', 'company'] as const;
export const CONTACT_FILTER_COLUMNS = ['status', 'company'] as const;

export type ContactSortColumn = (typeof CONTACT_SORT_COLUMNS)[number];
export type ContactFilterColumn = (typeof CONTACT_FILTER_COLUMNS)[number];

export type ContactListQuery = ListQuery<
  ContactSortColumn,
  ContactFilterColumn
>;

const CONTACT_QUERY_SPEC: QuerySpec<ContactSortColumn, ContactFilterColumn> = {
  sortColumns: CONTACT_SORT_COLUMNS,
  filterColumns: CONTACT_FILTER_COLUMNS,
  defaultSort: '-createdAt',
  defaultLimit: 50,
};

export function toContactListQuery(
  dto: ListContactsQueryDto,
): ContactListQuery {
  return toListQuery(CONTACT_QUERY_SPEC, dto);
}

export function toNextCursor(
  row: Pick<Contact, 'id'>,
  sort: SortSpec<ContactSortColumn>,
  filters: FilterSpec<ContactFilterColumn>,
): string {
  return encodeCursor<ContactSortColumn, ContactFilterColumn>({
    id: row.id,
    sort: toSortParam(sort),
    filters,
  });
}

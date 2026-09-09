import { Prisma } from '../generated/prisma/client';
import { parseSort } from '../common/query/sort';
import type { SortParam, SortSpec } from '../common/query/sort';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';

export const CONTACT_SORT_COLUMNS = ['createdAt', 'name', 'company'] as const;

export type ContactSortColumn = (typeof CONTACT_SORT_COLUMNS)[number];

export const DEFAULT_CONTACT_SORT: SortParam<ContactSortColumn> = '-createdAt';

export type ContactListQuery = {
  sort: SortSpec<ContactSortColumn>;
};

export function toContactListQuery(
  dto: ListContactsQueryDto,
): ContactListQuery {
  return {
    sort: parseSort(dto.sort, DEFAULT_CONTACT_SORT),
  };
}

export function toOrderBy(
  spec: SortSpec<ContactSortColumn>,
): Prisma.ContactOrderByWithRelationInput[] {
  return [{ [spec.column]: spec.direction }, { id: spec.direction }];
}

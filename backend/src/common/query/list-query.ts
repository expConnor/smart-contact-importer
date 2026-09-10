import { Cursor, assertCursorMatches, decodeCursor } from './cursor';
import { FilterSpec, parseFilters } from './filter';
import { SortParam, SortSpec, parseSort } from './sort';

export type QuerySpec<C extends string, F extends string> = {
  sortColumns: readonly C[];
  filterColumns: readonly F[];
  defaultSort: SortParam<C>;
  defaultLimit: number;
};

export type ListQuery<C extends string, F extends string> = {
  sort: SortSpec<C>;
  filters: FilterSpec<F>;
  limit: number;
  cursor: Cursor<C, F> | null;
};

export type ListQueryDto<C extends string, F extends string> = Partial<
  Record<F, string | undefined>
> & {
  sort?: SortParam<C>;
  limit?: number;
  cursor?: string;
};

export function toListQuery<C extends string, F extends string>(
  spec: QuerySpec<C, F>,
  dto: ListQueryDto<C, F>,
): ListQuery<C, F> {
  const sort = parseSort(dto.sort, spec.defaultSort);
  const filters = parseFilters(spec.filterColumns, dto);

  const cursor = dto.cursor
    ? decodeCursor<C, F>(dto.cursor, spec.sortColumns, spec.filterColumns)
    : null;

  assertCursorMatches(cursor, sort, filters);

  return { sort, filters, limit: dto.limit ?? spec.defaultLimit, cursor };
}

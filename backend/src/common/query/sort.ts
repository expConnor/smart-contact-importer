export type SortParam<C extends string> = C | `-${C}`;

export type SortSpec<C extends string> = {
  column: C;
  direction: 'asc' | 'desc';
};

export function sortParams<C extends string>(
  cols: readonly C[],
): SortParam<C>[] {
  return cols.flatMap<SortParam<C>>((col) => [col, `-${col}`]);
}

export function parseSort<C extends string>(
  param: SortParam<C> | undefined,
  fallback: SortParam<C>,
): SortSpec<C> {
  const value = param ?? fallback;
  const descending = value.startsWith('-');
  return {
    column: (descending ? value.slice(1) : value) as C,
    direction: descending ? 'desc' : 'asc',
  };
}

export function toSortParam<C extends string>(spec: SortSpec<C>): SortParam<C> {
  return spec.direction === 'desc' ? `-${spec.column}` : spec.column;
}

export function toOrderBy<C extends string>(
  spec: SortSpec<C>,
): Record<string, 'asc' | 'desc'>[] {
  return [{ [spec.column]: spec.direction }, { id: spec.direction }];
}

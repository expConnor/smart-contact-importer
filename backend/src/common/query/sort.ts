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

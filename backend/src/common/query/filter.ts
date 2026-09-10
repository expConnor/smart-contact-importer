//`C` is the union of one entity's filterable column names
export type Filter<C extends string> = {
  column: C;
  value: string;
};

export type FilterSpec<C extends string> = Filter<C>[];

// `source` is keyed by column name, so a DTO whose fields are named after the
// columns passes straight in. Driving the loop from `cols` rather than the
// source's keys means an unknown key can never reach the spec, and no column
// can appear twice.
export function parseFilters<C extends string>(
  cols: readonly C[],
  source: Partial<Record<C, string | undefined>>,
): FilterSpec<C> {
  return cols.flatMap<Filter<C>>((column) => {
    const value = source[column]?.trim();
    return value ? [{ column, value }] : [];
  });
}

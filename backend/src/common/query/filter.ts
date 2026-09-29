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
    const value = source[column]?.trim().toLowerCase();
    return value ? [{ column, value }] : [];
  });
}

export function filtersEqual<C extends string>(
  a: FilterSpec<C>,
  b: FilterSpec<C>,
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (filter, i) =>
        filter.column === b[i].column && filter.value === b[i].value,
    )
  );
}

// `contains` with mode: 'insensitive' makes Prisma emit ILIKE '%value%', so `%`
// and `_` in a client-supplied value act as wildcards too — ?company=% matched
// every row. Backslash is ILIKE's default escape character, so escaping keeps
// them plain characters.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

// Each filter is a case-insensitive substring search. Returns the clause map
// itself, so the caller writes `where: toWhere(...)` rather than spreading a
// partial object. An empty spec gives an empty object,
// which Prisma reads as "no filter".
export function toWhere<C extends string>(
  spec: FilterSpec<C>,
): Record<string, { contains: string; mode: 'insensitive' }> {
  const clauses: Record<string, { contains: string; mode: 'insensitive' }> = {};

  for (const clause of spec) {
    clauses[clause.column] = {
      contains: escapeLike(clause.value),
      mode: 'insensitive',
    };
  }

  return clauses;
}

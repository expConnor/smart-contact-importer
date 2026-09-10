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

// mode: 'insensitive' makes Prisma emit ILIKE, so `%` and `_` in a client-supplied
// value act as wildcards — ?company=% matched every row. Backslash is ILIKE's
// default escape character, so escaping keeps an equality filter an equality filter.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

// Returns the clause map itself, so the caller writes `where: toWhere(...)`
// rather than spreading a partial object. An empty spec gives an empty object,
// which Prisma reads as "no filter".
export function toWhere<C extends string>(
  spec: FilterSpec<C>,
): Record<string, { equals: string; mode: 'insensitive' }> {
  const clauses: Record<string, { equals: string; mode: 'insensitive' }> = {};

  for (const clause of spec) {
    clauses[clause.column] = {
      equals: escapeLike(clause.value),
      mode: 'insensitive',
    };
  }

  return clauses;
}

import { filtersEqual, parseFilters, toWhere, type FilterSpec } from './filter';

const COLS = ['status', 'company'] as const;
type Col = (typeof COLS)[number];

describe('parseFilters', () => {
  it('trims and lowercases each value', () => {
    expect(
      parseFilters<Col>(COLS, { status: '  ACTIVE ', company: 'Acme' }),
    ).toEqual([
      { column: 'status', value: 'active' },
      { column: 'company', value: 'acme' },
    ]);
  });

  // The loop runs over `cols`, so the spec's order is the column list's order
  // whatever order the query string arrived in. filtersEqual compares by
  // position, so a spec built from the request and a spec decoded from a cursor
  // only ever agree because both were built this way.
  it('orders by the column list, not by the source keys', () => {
    expect(
      parseFilters<Col>(COLS, { company: 'acme', status: 'active' }),
    ).toEqual([
      { column: 'status', value: 'active' },
      { column: 'company', value: 'acme' },
    ]);
  });

  it('drops absent, empty and whitespace-only values', () => {
    expect(parseFilters<Col>(COLS, { status: undefined, company: '' })).toEqual(
      [],
    );
    expect(parseFilters<Col>(COLS, { status: '   ' })).toEqual([]);
  });

  // A DTO with forbidNonWhitelisted should never let one through, but this is
  // the second lock: an unknown key cannot become a column because it is never
  // read. If the loop were driven by Object.keys(source), `password` would
  // reach toWhere and then Prisma.
  it('ignores keys that are not columns', () => {
    const source = { status: 'active', password: 'hunter2' } as Partial<
      Record<Col, string>
    >;

    expect(parseFilters<Col>(COLS, source)).toEqual([
      { column: 'status', value: 'active' },
    ]);
  });

  it('cannot emit the same column twice', () => {
    const spec = parseFilters<Col>(COLS, { status: 'active', company: 'acme' });
    const columns = spec.map((filter) => filter.column);

    expect(new Set(columns).size).toBe(columns.length);
  });
});

describe('filtersEqual', () => {
  const spec: FilterSpec<Col> = [
    { column: 'status', value: 'active' },
    { column: 'company', value: 'acme' },
  ];

  it('is true for the same filters and for two empty specs', () => {
    expect(filtersEqual<Col>(spec, [...spec])).toBe(true);
    expect(filtersEqual<Col>([], [])).toBe(true);
  });

  it('is false when a value differs', () => {
    expect(
      filtersEqual<Col>(spec, [
        { column: 'status', value: 'active' },
        { column: 'company', value: 'globex' },
      ]),
    ).toBe(false);
  });

  it('is false when one side has an extra filter', () => {
    expect(filtersEqual<Col>(spec, [spec[0]])).toBe(false);
    expect(filtersEqual<Col>([spec[0]], spec)).toBe(false);
  });

  // Positional, not set-based. parseFilters guarantees canonical order for
  // anything built from a request; a cursor carrying the same two filters
  // reversed is a forged cursor and is rejected rather than matched.
  it('is false when the same filters are in a different order', () => {
    expect(filtersEqual<Col>(spec, [spec[1], spec[0]])).toBe(false);
  });
});

describe('toWhere', () => {
  it('gives Prisma an empty object for an empty spec', () => {
    expect(toWhere<Col>([])).toEqual({});
  });

  it('builds a case-insensitive substring clause per column', () => {
    expect(
      toWhere<Col>([
        { column: 'status', value: 'active' },
        { column: 'company', value: 'acme' },
      ]),
    ).toEqual({
      status: { contains: 'active', mode: 'insensitive' },
      company: { contains: 'acme', mode: 'insensitive' },
    });
  });

  // `contains` with mode: 'insensitive' makes Prisma emit ILIKE '%value%',
  // which reads `%` and `_` inside the value as wildcards too. Unescaped,
  // `?company=%` matched every row in the table — a search for a literal
  // percent sign that returns everything. Each of the three characters is
  // written out longhand below because the escaping is easy to read wrong: in
  // source, '\\%' is the two characters backslash and percent.
  it.each([
    ['%', '\\%'],
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['c\\d', 'c\\\\d'],
  ])('escapes %j to %j', (value, escaped) => {
    expect(toWhere<Col>([{ column: 'company', value }])).toEqual({
      company: { contains: escaped, mode: 'insensitive' },
    });
  });

  // The replace scans the input, never its own output, so a backslash already
  // sitting in front of a wildcard does not swallow the escape the wildcard
  // needs. Input is backslash-percent; output is three backslashes and a
  // percent — an escaped backslash followed by an escaped percent.
  it('escapes a backslash and the wildcard behind it independently', () => {
    expect(toWhere<Col>([{ column: 'company', value: '\\%' }])).toEqual({
      company: { contains: '\\\\\\%', mode: 'insensitive' },
    });
  });

  it('leaves a value with no wildcard characters alone', () => {
    expect(toWhere<Col>([{ column: 'company', value: 'acme corp' }])).toEqual({
      company: { contains: 'acme corp', mode: 'insensitive' },
    });
  });
});

import {
  parseSort,
  sortParams,
  toOrderBy,
  toSortParam,
  type SortParam,
} from './sort';

// Two columns is the smallest set that shows sortParams pairing each one
// rather than prefixing the list once. Named after real contact columns so the
// `-createdAt` default below reads as the default it actually is.
const COLS = ['createdAt', 'name'] as const;
type Col = (typeof COLS)[number];

const DEFAULT_SORT: SortParam<Col> = '-createdAt';

describe('sortParams', () => {
  it('pairs every column with its descending form, ascending first', () => {
    expect(sortParams(COLS)).toEqual([
      'createdAt',
      '-createdAt',
      'name',
      '-name',
    ]);
  });

  // decodeCursor validates a forged `sort` with `.includes` against this list.
  // If a column ever went in already prefixed, `-createdAt` would appear twice
  // and `--createdAt` would become accepted input.
  it('produces no duplicates and no double prefix', () => {
    const params = sortParams(COLS);

    expect(new Set(params).size).toBe(params.length);
    expect(params.some((param) => param.startsWith('--'))).toBe(false);
  });

  it('returns an empty list for no columns', () => {
    expect(sortParams([])).toEqual([]);
  });
});

describe('parseSort', () => {
  it('falls back when the parameter is absent', () => {
    expect(parseSort<Col>(undefined, DEFAULT_SORT)).toEqual({
      column: 'createdAt',
      direction: 'desc',
    });
  });

  it('reads a bare column as ascending', () => {
    expect(parseSort<Col>('name', DEFAULT_SORT)).toEqual({
      column: 'name',
      direction: 'asc',
    });
  });

  it('strips the prefix and reads the rest as descending', () => {
    expect(parseSort<Col>('-name', DEFAULT_SORT)).toEqual({
      column: 'name',
      direction: 'desc',
    });
  });

  // The pair is a codec: a cursor stores toSortParam(spec) and every later
  // request is compared against it. A round trip that loses the prefix would
  // make `-name` and `name` share a cursor and silently re-anchor the page.
  // Written out rather than fed from sortParams(COLS): a table built by a
  // function under test shrinks silently when that function does.
  it.each<SortParam<Col>>(['createdAt', '-createdAt', 'name', '-name'])(
    'round-trips %s',
    (param) => {
      expect(toSortParam(parseSort<Col>(param, DEFAULT_SORT))).toBe(param);
    },
  );
});

describe('toOrderBy', () => {
  // `id` is the tiebreaker for rows that share the sorted column's value —
  // without it Postgres may order ties differently on each page and the cursor
  // anchor lands in the wrong place. T3's nine-row `company` paging test covers
  // the missing entry; the direction is this test's own. T3 recorded a
  // hardcoded `{ id: 'asc' }` as an equivalent mutant because a mixed-direction
  // tiebreaker is still a consistent total order and Prisma derives the cursor
  // predicate from the same orderBy — true over HTTP, and the reason it needs
  // pinning here instead.
  it('appends id as the tiebreaker in the same direction', () => {
    expect(toOrderBy<Col>({ column: 'name', direction: 'asc' })).toEqual([
      { name: 'asc' },
      { id: 'asc' },
    ]);

    expect(toOrderBy<Col>({ column: 'createdAt', direction: 'desc' })).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

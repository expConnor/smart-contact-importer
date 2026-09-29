import { describe, expect, it } from 'vitest';
import {
  formatCell,
  formatDate,
  isSortColumn,
  nextSort,
  rowCount,
  sortDirection,
} from './table';

describe('formatCell', () => {
  // A blank cell looks like a render bug; a dash says "no value".
  it('shows a dash for an empty value', () => {
    expect(formatCell('')).toBe('—');
  });

  it('shows the value as is', () => {
    expect(formatCell('Acme')).toBe('Acme');
  });
});

describe('formatDate', () => {
  it('shows the day as YYYY-MM-DD', () => {
    expect(formatDate('2026-09-01T09:00:00.000Z')).toBe('2026-09-01');
  });

  // Late UTC evening is already the next day east of UTC; the UTC day wins.
  it('uses the UTC day, not the browser day', () => {
    expect(formatDate('2026-03-10T23:30:00.000Z')).toBe('2026-03-10');
  });
});

describe('rowCount', () => {
  it('shows only the count while more pages exist', () => {
    expect(rowCount(50, true)).toBe('50 rows');
  });

  it('marks the end of the list on the last page', () => {
    expect(rowCount(7, false)).toBe('7 rows · end of list');
  });

  it('uses the singular for one row', () => {
    expect(rowCount(1, false)).toBe('1 row · end of list');
  });

  it('uses the plural for zero rows', () => {
    expect(rowCount(0, false)).toBe('0 rows · end of list');
  });
});

describe('nextSort', () => {
  it('flips the current column from ascending to descending', () => {
    expect(nextSort('name', 'name')).toBe('-name');
  });

  it('flips the current column from descending to ascending', () => {
    expect(nextSort('-name', 'name')).toBe('name');
  });

  it('starts a new column ascending', () => {
    expect(nextSort('-createdAt', 'company')).toBe('company');
  });

  // Newest first is what you want when you switch to Created.
  it('starts Created descending', () => {
    expect(nextSort('name', 'createdAt')).toBe('-createdAt');
  });
});

describe('sortDirection', () => {
  it('is ascending when the sort is the column', () => {
    expect(sortDirection('company', 'company')).toBe('ascending');
  });

  it('is descending when the sort is the column with a minus', () => {
    expect(sortDirection('-company', 'company')).toBe('descending');
  });

  it('is undefined for a column the table is not sorted by', () => {
    expect(sortDirection('-createdAt', 'company')).toBeUndefined();
  });
});

describe('isSortColumn', () => {
  it.each(['name', 'company', 'createdAt'])('accepts %s', (id) => {
    expect(isSortColumn(id)).toBe(true);
  });

  // The API rejects any other sort, so these headers are not buttons.
  it.each(['email', 'jobTitle', 'phone', 'status'])('rejects %s', (id) => {
    expect(isSortColumn(id)).toBe(false);
  });
});

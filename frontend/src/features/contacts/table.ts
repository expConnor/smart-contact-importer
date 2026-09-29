import type { ContactSort } from './api';

// A blank cell looks like a render bug; a dash says "no value".
export function formatCell(value: string): string {
  return value === '' ? '—' : value;
}

// The API sends UTC ISO strings. Slicing keeps the UTC day; a Date would
// shift it to the browser's day near midnight.
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

// The API has no total count, so say whether this page is the last one.
export function rowCount(count: number, hasMore: boolean): string {
  const rows = `${count} ${count === 1 ? 'row' : 'rows'}`;
  return hasMore ? rows : `${rows} · end of list`;
}

// The API can sort by these columns only.
export type SortColumn = 'name' | 'company' | 'createdAt';

export function isSortColumn(id: string): id is SortColumn {
  return id === 'name' || id === 'company' || id === 'createdAt';
}

// Same column flips direction. A new column starts A→Z, except Created,
// where newest first is the useful start.
export function nextSort(
  current: ContactSort,
  column: SortColumn,
): ContactSort {
  if (current === column) return `-${column}`;
  if (current === `-${column}`) return column;
  return column === 'createdAt' ? '-createdAt' : column;
}

// In the words of `aria-sort`, so the header can pass it straight on.
export function sortDirection(
  sort: ContactSort,
  column: SortColumn,
): 'ascending' | 'descending' | undefined {
  if (sort === column) return 'ascending';
  if (sort === `-${column}`) return 'descending';
  return undefined;
}

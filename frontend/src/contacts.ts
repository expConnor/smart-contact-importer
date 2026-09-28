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

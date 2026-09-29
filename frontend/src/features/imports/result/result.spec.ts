import { describe, expect, it } from 'vitest';
import { cappedNote, rawRowText, skippedLine } from './result';

describe('skippedLine', () => {
  // Email is the only field that can sink a row, so "no usable email" is
  // always the true reason.
  it.each([
    [0, 'Every row was imported.'],
    [1, '1 row had no usable email and was skipped.'],
    [2, '2 rows had no usable email and were skipped.'],
  ])('says %i failed rows as "%s"', (failedRows, line) => {
    expect(skippedLine(failedRows)).toBe(line);
  });
});

describe('rawRowText', () => {
  // Google exports carry dozens of empty columns; only filled cells help.
  it('lists filled cells as "Header: value", skipping empty ones', () => {
    expect(rawRowText({ Name: 'Ada', Email: '', Company: 'X' })).toBe(
      'Name: Ada · Company: X',
    );
  });

  // Postgres jsonb stores keys shortest first, so the file's order comes in
  // separately.
  it('follows the given column order, not the key order', () => {
    expect(
      rawRowText({ Phone: '1', 'Full Name': 'Ada' }, ['Full Name', 'Phone']),
    ).toBe('Full Name: Ada · Phone: 1');
  });

  it('is empty when every cell is empty', () => {
    expect(rawRowText({ Name: '', Email: '' })).toBe('');
  });
});

describe('cappedNote', () => {
  // The API sends at most 100 errors; say so rather than look complete.
  it('explains the cap when more rows failed than are shown', () => {
    expect(cappedNote(100, 240)).toBe(
      'Showing the first 100 of 240 failed rows.',
    );
  });

  it('is null when every failed row is shown', () => {
    expect(cappedNote(2, 2)).toBeNull();
  });
});

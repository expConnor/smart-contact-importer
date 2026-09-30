import { describe, expect, it } from 'vitest';
import type { InferenceFallback, InferenceSource } from '../api';
import {
  cappedNote,
  delimiterLabel,
  fallbackLine,
  formatBytes,
  pathTaken,
  rawRowText,
  skippedLine,
} from './result';

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

describe('pathTaken', () => {
  // Order does not matter: the diagram only asks "is this step lit?".
  it.each<[InferenceSource | null, InferenceFallback | null, string[]]>([
    [
      'LLM',
      null,
      [
        'sniff',
        'sniff-guess',
        'guess',
        'guess-validate',
        'validate',
        'validate-mapping',
        'mapping',
      ],
    ],
    [
      'HEURISTIC',
      'NO_KEY',
      ['sniff', 'sniff-rules', 'rules', 'rules-mapping', 'mapping'],
    ],
    [
      'HEURISTIC',
      'GUESS_FAILED',
      [
        'sniff',
        'sniff-guess',
        'guess',
        'guess-rules',
        'rules',
        'rules-mapping',
        'mapping',
      ],
    ],
    [
      'HEURISTIC',
      'GUESS_REJECTED',
      [
        'sniff',
        'sniff-guess',
        'guess',
        'guess-validate',
        'validate',
        'validate-rules',
        'rules',
        'rules-mapping',
        'mapping',
      ],
    ],
    // A job analysed before the reason was stored: no entry edge is lit.
    ['HEURISTIC', null, ['sniff', 'rules', 'rules-mapping', 'mapping']],
    [null, null, []],
    [null, 'NO_KEY', []],
  ])('lights %s + %s', (source, fallback, lit) => {
    expect([...pathTaken(source, fallback)].sort()).toEqual([...lit].sort());
  });
});

describe('fallbackLine', () => {
  it.each<[InferenceSource | null, InferenceFallback | null, string]>([
    [
      'LLM',
      null,
      "Claude's guess passed validation and became the proposed mapping.",
    ],
    [
      'HEURISTIC',
      'NO_KEY',
      'No API key is set, so the built-in rules proposed the mapping.',
    ],
    [
      'HEURISTIC',
      'GUESS_FAILED',
      'The call to Claude failed, so the built-in rules proposed the mapping.',
    ],
    [
      'HEURISTIC',
      'GUESS_REJECTED',
      "Claude's guess didn't fit the file, so the built-in rules proposed the mapping.",
    ],
    ['HEURISTIC', null, 'The built-in rules proposed the mapping.'],
    [null, null, ''],
  ])('says %s + %s as "%s"', (source, fallback, line) => {
    expect(fallbackLine(source, fallback)).toBe(line);
  });
});

describe('formatBytes', () => {
  // 1024-based, one decimal from KB up.
  it.each([
    [512, '512 B'],
    [1434, '1.4 KB'],
    [2621440, '2.5 MB'],
    // Rounds to 1024.0 KB, so it is shown as MB instead.
    [1048575, '1.0 MB'],
  ])('formats %i as "%s"', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe('delimiterLabel', () => {
  it.each<[string | null, string]>([
    [',', '","'],
    [';', '";"'],
    ['\t', 'tab'],
    [null, '—'],
  ])('labels %j as %s', (delimiter, label) => {
    expect(delimiterLabel(delimiter)).toBe(label);
  });
});

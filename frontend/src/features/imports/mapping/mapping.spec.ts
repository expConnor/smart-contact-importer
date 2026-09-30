import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/client';
import type { ColumnMapping, TargetField } from '../api';
import {
  columnSamples,
  isLowConfidence,
  isManual,
  mappingProblems,
  meterLevel,
  serverIssues,
  sourceLabel,
  toPayload,
} from './mapping';

function row(
  sourceColumn: string,
  targetField: TargetField,
  confidence = 0.9,
): ColumnMapping {
  return { sourceColumn, targetField, confidence };
}

describe('meterLevel', () => {
  // 0.85 is the line between "looks right" and "check this row".
  it.each([
    [0.9, 3],
    [0.85, 3],
    [0.7, 2],
    [0.6, 2],
    [0.5, 1],
    [0.4, 1],
  ])('shows %f as %i bars', (confidence, bars) => {
    expect(meterLevel(confidence)).toBe(bars);
  });
});

describe('isLowConfidence', () => {
  // Below 0.85 the row is shaded: worth a second look.
  it.each([
    [0.84, true],
    [0.5, true],
    [0.85, false],
    [0.99, false],
  ])('reads %f as low: %s', (confidence, low) => {
    expect(isLowConfidence(confidence)).toBe(low);
  });
});

describe('isManual', () => {
  it('is manual once the user picks another field', () => {
    expect(isManual(row('Name', 'company'), row('Name', 'name'))).toBe(true);
  });

  // Picking the proposal again brings its score back.
  it('is not manual while the field matches the proposal', () => {
    expect(isManual(row('Name', 'name'), row('Name', 'name'))).toBe(false);
  });
});

describe('columnSamples', () => {
  const sampleRows = [
    ['Kai', ' kai@x.test ', ''],
    ['Lena', '', ''],
    ['Mateo', 'mateo@x.test', ''],
  ];

  it('takes one column, trimmed, without blanks', () => {
    expect(columnSamples(sampleRows, 1)).toEqual([
      'kai@x.test',
      'mateo@x.test',
    ]);
  });

  it('is empty when the column has no values', () => {
    expect(columnSamples(sampleRows, 2)).toEqual([]);
  });

  // A ragged CSV row can end before the column does.
  it('skips rows that are too short', () => {
    expect(columnSamples([['a'], ['b', 'c']], 1)).toEqual(['c']);
  });
});

describe('mappingProblems', () => {
  it('finds nothing in a valid mapping', () => {
    expect(
      mappingProblems([row('Email', 'email'), row('Name', 'name')]),
    ).toEqual([]);
  });

  it('asks for an email column', () => {
    expect(mappingProblems([row('Name', 'name')])).toEqual([
      "Pick a column for email. Rows without an email can't be imported.",
    ]);
  });

  it('names every column set to the same field, in one line', () => {
    expect(
      mappingProblems([
        row('First Name', 'name'),
        row('Email', 'email'),
        row('Last Name', 'name'),
      ]),
    ).toEqual([
      'name is set on more than one column: “First Name”, “Last Name”. Each field can come from one column only.',
    ]);
  });

  // skip is the one field many columns may share.
  it('lets many columns be skipped', () => {
    expect(
      mappingProblems([
        row('Email', 'email'),
        row('URL', '__ignore__'),
        row('Connected On', '__ignore__'),
      ]),
    ).toEqual([]);
  });

  it('reports every problem at once', () => {
    expect(
      mappingProblems([row('First Name', 'name'), row('Last Name', 'name')]),
    ).toHaveLength(2);
  });
});

describe('toPayload', () => {
  const proposed = [row('Email', 'email', 0.9), row('Company', 'company', 0.5)];

  it('keeps the score of an untouched row', () => {
    const payload = toPayload(3, proposed, proposed);

    expect(payload).toEqual({ headerRowIndex: 3, mappings: proposed });
  });

  // The old score described a choice the user replaced.
  it('sends confidence 1 for a row the user changed', () => {
    const rows = [proposed[0], row('Company', '__ignore__', 0.5)];

    expect(toPayload(3, rows, proposed).mappings[1]).toEqual(
      row('Company', '__ignore__', 1),
    );
  });
});

describe('serverIssues', () => {
  it('lists each issue of a rejected mapping as field: message', () => {
    const error = new ApiError(
      422,
      'MAPPING_INVALID',
      'Mapping does not fit the file',
      [
        {
          field: 'mappings.0.sourceColumn',
          message: '"X" is not a column in the file',
        },
        { field: 'mappings', message: 'No column is mapped to email' },
      ],
    );

    expect(serverIssues(error)).toEqual([
      'mappings.0.sourceColumn: "X" is not a column in the file',
      'mappings: No column is mapped to email',
    ]);
  });

  // Nothing in the mapping is wrong: the job moved on.
  it('has no issues for a 409', () => {
    const error = new ApiError(409, 'CONFLICT', 'Conflict');

    expect(serverIssues(error)).toEqual([]);
  });

  it('has no issues for a network error', () => {
    expect(serverIssues(new TypeError('Failed to fetch'))).toEqual([]);
  });
});

describe('sourceLabel', () => {
  it.each([
    ['HEURISTIC', 'built-in rules'],
    ['LLM', 'AI'],
  ] as const)('reads %s as %s', (source, label) => {
    expect(sourceLabel(source)).toBe(label);
  });
});

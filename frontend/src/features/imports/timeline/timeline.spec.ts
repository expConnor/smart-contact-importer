import { describe, expect, it } from 'vitest';
import type { ColumnMapping } from '../api';
import { nodeLooks, phaseOf } from './timeline';

const MAPPING: ColumnMapping[] = [
  { sourceColumn: 'Email', targetField: 'email', confidence: 1 },
];

describe('nodeLooks', () => {
  it('marks nodes before the status past and after it future', () => {
    expect(
      nodeLooks({ status: 'AWAITING_MAPPING', proposedMapping: MAPPING }),
    ).toEqual(['past', 'past', 'current', 'future', 'future', 'future']);
  });

  it('keeps the last node current once completed', () => {
    expect(
      nodeLooks({ status: 'COMPLETED', proposedMapping: MAPPING }),
    ).toEqual(['past', 'past', 'past', 'past', 'past', 'current']);
  });

  // No mapping yet: the worker died reading the file.
  it('fails ANALYZING when analysis never settled', () => {
    expect(nodeLooks({ status: 'FAILED', proposedMapping: null })).toEqual([
      'past',
      'failed',
      'future',
      'future',
      'future',
      'future',
    ]);
  });

  // Analysis wrote a mapping, so the failure came during the import.
  it('fails IMPORTING when analysis had settled', () => {
    expect(nodeLooks({ status: 'FAILED', proposedMapping: MAPPING })).toEqual([
      'past',
      'past',
      'past',
      'past',
      'failed',
      'future',
    ]);
  });
});

describe('phaseOf', () => {
  it.each([
    ['PENDING_ANALYSIS', 'analysis'],
    ['ANALYZING', 'analysis'],
    ['AWAITING_MAPPING', 'review'],
    ['PENDING_IMPORT', 'import'],
    ['IMPORTING', 'import'],
    ['COMPLETED', 'done'],
  ] as const)('%s → %s', (status, phase) => {
    expect(phaseOf({ status, proposedMapping: MAPPING })).toBe(phase);
  });

  it('puts a failed job in the phase of the node it failed from', () => {
    expect(phaseOf({ status: 'FAILED', proposedMapping: null })).toBe(
      'analysis',
    );
    expect(phaseOf({ status: 'FAILED', proposedMapping: MAPPING })).toBe(
      'import',
    );
  });
});

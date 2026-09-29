import { describe, expect, it } from 'vitest';
import {
  anyPolling,
  isAnalysing,
  isImporting,
  isPolling,
  shortId,
  statusLabel,
} from './status';

describe('isPolling', () => {
  // A worker still has something to do in these states.
  it.each([
    'PENDING_ANALYSIS',
    'ANALYZING',
    'PENDING_IMPORT',
    'IMPORTING',
  ] as const)('polls while %s', (status) => {
    expect(isPolling(status)).toBe(true);
  });

  // Nothing moves until the user acts, or the job is finished for good.
  it.each(['AWAITING_MAPPING', 'COMPLETED', 'FAILED'] as const)(
    'stops on %s',
    (status) => {
      expect(isPolling(status)).toBe(false);
    },
  );

  it('does not poll before the first answer', () => {
    expect(isPolling(undefined)).toBe(false);
  });
});

describe('isAnalysing', () => {
  it.each(['PENDING_ANALYSIS', 'ANALYZING'] as const)('is true for %s', (s) => {
    expect(isAnalysing(s)).toBe(true);
  });

  it.each(['AWAITING_MAPPING', 'IMPORTING', 'FAILED'] as const)(
    'is false for %s',
    (s) => {
      expect(isAnalysing(s)).toBe(false);
    },
  );
});

describe('isImporting', () => {
  it.each(['PENDING_IMPORT', 'IMPORTING'] as const)('is true for %s', (s) => {
    expect(isImporting(s)).toBe(true);
  });

  // The counts are final: nothing is importing any more.
  it.each(['ANALYZING', 'AWAITING_MAPPING', 'COMPLETED'] as const)(
    'is false for %s',
    (s) => {
      expect(isImporting(s)).toBe(false);
    },
  );
});

describe('anyPolling', () => {
  it('polls while one job still has worker activity', () => {
    expect(anyPolling([{ status: 'COMPLETED' }, { status: 'IMPORTING' }])).toBe(
      true,
    );
  });

  it('stops once every job waits on the user or is finished', () => {
    expect(
      anyPolling([{ status: 'COMPLETED' }, { status: 'AWAITING_MAPPING' }]),
    ).toBe(false);
  });

  it('does not poll an empty list', () => {
    expect(anyPolling([])).toBe(false);
  });

  it('does not poll before the first answer', () => {
    expect(anyPolling(undefined)).toBe(false);
  });
});

describe('statusLabel', () => {
  it.each([
    ['AWAITING_MAPPING', 'Awaiting mapping'],
    ['FAILED', 'Failed'],
  ] as const)('reads %s as %s', (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });
});

describe('shortId', () => {
  // A UUIDv7 starts with its timestamp, so jobs made minutes apart share the
  // first 8 characters. The random tail tells them apart.
  it('shows the last 8 characters', () => {
    expect(shortId('01a0e920-5b1c-7aaa-8bbb-0123456789ab')).toBe('456789ab');
  });
});

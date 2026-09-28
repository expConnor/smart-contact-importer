import { describe, expect, it } from 'vitest';
import { anyPolling, isPolling, shortId, statusLabel } from './job';

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

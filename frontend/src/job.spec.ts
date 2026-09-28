import { describe, expect, it } from 'vitest';
import { isPolling } from './job';

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

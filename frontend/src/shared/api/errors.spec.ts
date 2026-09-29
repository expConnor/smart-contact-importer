import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { errorText, firstDetailMessage } from './errors';

describe('errorText', () => {
  it('adds the status to an API error', () => {
    expect(errorText(new ApiError(500, 'INTERNAL', 'Server error'))).toBe(
      'Server error (500)',
    );
  });

  // fetch throws a TypeError when the network is down: no status to show.
  it('shows the message of a non-API error', () => {
    expect(errorText(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
  });
});

describe('firstDetailMessage', () => {
  it('reads the message of the first detail', () => {
    const error = new ApiError(400, 'VALIDATION_FAILED', 'Invalid', [
      { field: 'file', message: 'File must be a .csv' },
      { field: 'file', message: 'second' },
    ]);

    expect(firstDetailMessage(error)).toBe('File must be a .csv');
  });

  it.each([
    ['no details', undefined],
    ['empty details', []],
    ['details that are not a list', { message: 'x' }],
    ['a first detail without a message', [{ field: 'file' }]],
  ])('is undefined for %s', (_case, details: unknown) => {
    const error = new ApiError(400, 'VALIDATION_FAILED', 'Invalid', details);

    expect(firstDetailMessage(error)).toBeUndefined();
  });
});

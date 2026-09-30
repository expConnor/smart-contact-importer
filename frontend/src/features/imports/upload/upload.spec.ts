import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/client';
import { fixtureOptions, formatKb, uploadErrorText } from './upload';

describe('uploadErrorText', () => {
  // The envelope message is generic; the field detail says what to fix.
  it('shows the first detail message', () => {
    const error = new ApiError(
      400,
      'VALIDATION_FAILED',
      'Request validation failed',
      [{ field: 'file', message: 'File must be a .csv' }],
    );

    expect(uploadErrorText(error)).toBe('File must be a .csv');
  });

  it('names the size limit on 413', () => {
    const error = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Payload too large');

    expect(uploadErrorText(error)).toBe('File is over 10 MB.');
  });

  it('falls back to message and status without details', () => {
    const error = new ApiError(500, 'INTERNAL', 'Internal server error');

    expect(uploadErrorText(error)).toBe('Internal server error (500)');
  });

  // fetch throws a TypeError when the network is down: no status to show.
  it('shows the message of a non-API error', () => {
    expect(uploadErrorText(new TypeError('Failed to fetch'))).toBe(
      'Failed to fetch',
    );
  });
});

describe('formatKb', () => {
  it.each([
    [2048, '2.0 KB'],
    [512, '0.5 KB'],
  ])('shows %i bytes as %s', (bytes, text) => {
    expect(formatKb(bytes)).toBe(text);
  });
});

describe('fixtureOptions', () => {
  it('names each fixture by its file name, sorted', () => {
    const urls = {
      '../../../../../fixtures/linkedin-connections.csv': '/a.csv',
      '../../../../../fixtures/clean.csv': '/b.csv',
    };

    expect(fixtureOptions(urls)).toEqual([
      { name: 'clean.csv', url: '/b.csv' },
      { name: 'linkedin-connections.csv', url: '/a.csv' },
    ]);
  });
});

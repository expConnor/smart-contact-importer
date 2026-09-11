import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { IncomingHttpHeaders } from 'http';
import { catchAppError, fieldErrors } from '../../test/app-error.fixture';
import { IDEMPOTENCY_KEY, IdempotencyKeyGuard } from './idempotency-key.guard';

/**
 * The guard reads one header and writes one symbol-keyed property, so a real
 * Nest context buys nothing over the two methods it actually calls. The
 * request object is returned alongside so a test can read back what the guard
 * stashed on it.
 */
function contextFor(headers: IncomingHttpHeaders): {
  context: ExecutionContext;
  request: Request;
} {
  const request = { headers } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

const guard = new IdempotencyKeyGuard();

const run = (headers: IncomingHttpHeaders): Request => {
  const { context, request } = contextFor(headers);
  expect(guard.canActivate(context)).toBe(true);
  return request;
};

const reject = (headers: IncomingHttpHeaders) =>
  catchAppError(() => guard.canActivate(contextFor(headers).context));

describe('IdempotencyKeyGuard', () => {
  it('stashes a valid key on the request and lets the route run', () => {
    const request = run({ 'idempotency-key': 'import-2026-09-11' });

    expect(request[IDEMPOTENCY_KEY]).toBe('import-2026-09-11');
  });

  // The stored value is what reaches the unique index, so trimming here is
  // what makes ' key ' and 'key' the same import job rather than two.
  it('stores the trimmed key, not the header as sent', () => {
    const request = run({ 'idempotency-key': '  abcdefgh  ' });

    expect(request[IDEMPOTENCY_KEY]).toBe('abcdefgh');
  });

  it.each([
    ['the shortest allowed key', 'a'.repeat(8)],
    ['the longest allowed key', 'a'.repeat(255)],
    ['every character the pattern allows', 'Aa0_.:-Z'],
  ])('accepts %s', (_name, key) => {
    expect(run({ 'idempotency-key': key })[IDEMPOTENCY_KEY]).toBe(key);
  });

  it('rejects an absent header', () => {
    const error = reject({});

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.getStatus()).toBe(400);
    expect(fieldErrors(error)).toEqual([
      { field: 'Idempotency-Key', message: 'Idempotency-Key is missing' },
    ]);
  });

  // Node hands a repeated header over as an array. Picking one of the two
  // would let a client send two keys and get one job, which is the opposite of
  // what the header is for.
  it('rejects the header sent twice', () => {
    const error = reject({ 'idempotency-key': ['key-one', 'key-two'] });

    expect(fieldErrors(error)).toEqual([
      {
        field: 'Idempotency-Key',
        message: 'Idempotency-Key must be sent exactly once',
      },
    ]);
  });

  const PATTERN_MESSAGE =
    'Idempotency-Key must be 8-255 characters of [A-Za-z0-9_.:-]';

  it.each([
    ['one character short', 'a'.repeat(7)],
    ['one character long', 'a'.repeat(256)],
    ['a space inside', 'abcd efgh'],
    ['a slash', 'abcdefg/h'],
    ['a percent', 'abcdefg%h'],
    ['a quote', "abcdefg'h"],
  ])('rejects a key with %s', (_name, key) => {
    expect(fieldErrors(reject({ 'idempotency-key': key }))[0].message).toBe(
      PATTERN_MESSAGE,
    );
  });

  // Whitespace-only trims to empty and fails the pattern — it is a bad key,
  // not a missing one, and the two messages must not swap.
  it('rejects a whitespace-only key as malformed rather than missing', () => {
    expect(fieldErrors(reject({ 'idempotency-key': '     ' }))[0].message).toBe(
      PATTERN_MESSAGE,
    );
  });

  // JavaScript's `$` also matches immediately before a final newline, so an
  // anchored pattern is not on its own proof that the whole string matched.
  // A trailing newline is trimmed away; an embedded one has to be rejected by
  // the character class.
  it('rejects a key containing a newline', () => {
    expect(
      fieldErrors(reject({ 'idempotency-key': 'abcdefgh\nabcdefgh' }))[0]
        .message,
    ).toBe(PATTERN_MESSAGE);
  });

  it('leaves nothing on the request when it rejects', () => {
    const { context, request } = contextFor({});

    expect(() => guard.canActivate(context)).toThrow();
    expect(request[IDEMPOTENCY_KEY]).toBeUndefined();
  });
});

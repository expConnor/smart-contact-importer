import { HttpException } from '@nestjs/common';
import { AppError } from './app.error';
import { CATALOGUE, STATUS_TO_CODE } from './error-catalogue';
import type { ErrorCode } from './error-catalogue';

/**
 * Written out by hand, not derived from CATALOGUE. A test that reads the table
 * it is checking passes whatever the table says; this one fails when the table
 * changes, which is the point — status and message are the API's contract and
 * the frontend switches on the code.
 */
const EXPECTED: { code: ErrorCode; status: number; message: string }[] = [
  {
    code: 'VALIDATION_FAILED',
    status: 400,
    message: 'Request validation failed',
  },
  { code: 'UNAUTHORIZED', status: 401, message: 'Invalid credentials' },
  { code: 'NOT_FOUND', status: 404, message: 'Not found' },
  { code: 'CONFLICT', status: 409, message: 'Conflict' },
  { code: 'PAYLOAD_TOO_LARGE', status: 413, message: 'Payload too large' },
  { code: 'INTERNAL', status: 500, message: 'Internal server error' },
];

describe('CATALOGUE', () => {
  it('holds exactly the codes this suite knows about', () => {
    expect(Object.keys(CATALOGUE).sort()).toEqual(
      EXPECTED.map((entry) => entry.code).sort(),
    );
  });

  it.each(EXPECTED)(
    'maps $code to $status $message',
    ({ code, status, message }) => {
      expect(CATALOGUE[code]).toEqual({ status, message });
    },
  );

  // UNAUTHORIZED says 'Invalid credentials' for a missing cookie, an expired
  // one and a wrong password alike. Naming which of the three failed would
  // tell an attacker whether the email exists.
  it('says nothing about which credential was wrong', () => {
    expect(CATALOGUE.UNAUTHORIZED.message).toBe('Invalid credentials');
    expect(CATALOGUE.INTERNAL.message).toBe('Internal server error');
  });
});

describe('STATUS_TO_CODE', () => {
  // The filter's branch 2 keeps a framework exception's status and looks the
  // code up here. A status in CATALOGUE with no entry in this map would come
  // back as INTERNAL — a Nest 404 from an unmatched route reported to the
  // client as NOT_FOUND today, as a server error after the drift.
  it('is the exact inverse of the catalogue', () => {
    const inverse = Object.fromEntries(
      EXPECTED.map((entry) => [entry.status, entry.code]),
    );

    expect(STATUS_TO_CODE).toEqual(inverse);
  });

  // Two codes sharing a status makes the inverse ambiguous, and which one wins
  // would depend on key order in the source file.
  it('has one code per status', () => {
    const statuses = EXPECTED.map((entry) => entry.status);

    expect(new Set(statuses).size).toBe(statuses.length);
  });

  it('falls through to no code for a status nobody mapped', () => {
    expect(STATUS_TO_CODE[418]).toBeUndefined();
  });
});

describe('AppError', () => {
  it.each(EXPECTED)(
    'takes status and message from the catalogue for $code',
    ({ code, status, message }) => {
      const error = new AppError(code);

      expect(error.code).toBe(code);
      expect(error.getStatus()).toBe(status);
      expect(error.message).toBe(message);
      expect(error.details).toBeUndefined();
    },
  );

  it('carries details through untouched', () => {
    const details = [{ field: 'email', message: 'email must be an email' }];

    expect(new AppError('VALIDATION_FAILED', details).details).toBe(details);
  });

  // The override is the message only. Letting a call site pick the status too
  // would put the catalogue and the wire out of step, and the filter reads the
  // status back out of the catalogue by code anyway.
  it('lets a caller override the message but not the status', () => {
    const error = new AppError('CONFLICT', undefined, 'Import already exists');

    expect(error.message).toBe('Import already exists');
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  // AppErrorFilter tests `instanceof AppError` before `instanceof HttpException`
  // because every AppError is also an HttpException. Reversing the two branches
  // would drop `details` from every validation response.
  it('is an HttpException, which is why the filter checks it first', () => {
    expect(new AppError('NOT_FOUND')).toBeInstanceOf(HttpException);
  });
});

import { catchAppError, fieldErrors } from '../test/app-error.fixture';
import { Prisma } from '../generated/prisma/client';
import { assertCsvPresent, isIdempotencyConflict } from './imports.rules';

const aFile = (size: number): Express.Multer.File =>
  ({ size, originalname: 'contacts.csv' }) as Express.Multer.File;

/**
 * meta is whatever the driver adapter attached to the error; the rule reads it
 * defensively because Prisma types it as unknown. Building the error for real
 * rather than hand-rolling a lookalike is the point — `instanceof` is the
 * rule's first gate, and a plain object would sail past a broken one.
 */
const p2002 = (meta?: unknown): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: meta as Record<string, unknown> | undefined,
  });

const withConstraint = (
  constraint: unknown,
): Prisma.PrismaClientKnownRequestError =>
  p2002({ driverAdapterError: { cause: { constraint } } });

describe('assertCsvPresent', () => {
  it('accepts a file with bytes in it', () => {
    expect(() => assertCsvPresent(aFile(42))).not.toThrow();
  });

  // Multer leaves `file` undefined when the part is named something other than
  // the field the interceptor expects, so this is a client error, not a bug.
  it('rejects a missing file', () => {
    const error = catchAppError(() => assertCsvPresent(undefined));

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.getStatus()).toBe(400);
    expect(fieldErrors(error)).toEqual([
      { field: 'file', message: 'File is missing' },
    ]);
  });

  // A zero-byte upload is a distinct failure from no upload, and it is the one
  // that would otherwise reach the parser and produce an import job of nothing.
  it('rejects an empty file with its own message', () => {
    const error = catchAppError(() => assertCsvPresent(aFile(0)));

    expect(fieldErrors(error)).toEqual([
      { field: 'file', message: 'File cannot be empty' },
    ]);
  });
});

describe('isIdempotencyConflict', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a plain Error', new Error('boom')],
    ['a string', 'P2002'],
  ])('is false for %s', (_name, value) => {
    expect(isIdempotencyConflict(value)).toBe(false);
  });

  // P2003 is a foreign key violation. Only P2002 means a unique index fired,
  // and treating anything else as a replay would turn a real failure into a
  // 200 pointing at someone else's job.
  it('is false for a Prisma error that is not P2002', () => {
    const error = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: 'test',
    });

    expect(isIdempotencyConflict(error)).toBe(false);
  });

  // Shape 1 — a named unique index. This is what Postgres reports for
  // @@unique([userId, idempotencyKey]) once Prisma has named the index.
  it('is true when the named index mentions idempotencyKey', () => {
    expect(
      isIdempotencyConflict(
        withConstraint({ index: 'ImportJob_userId_idempotencyKey_key' }),
      ),
    ).toBe(true);
  });

  // Shape 2 — the columns, unnamed. Joined before the substring test, so a
  // match on the second element counts.
  it('is true when the reported fields include idempotencyKey', () => {
    expect(
      isIdempotencyConflict(
        withConstraint({ fields: ['userId', 'idempotencyKey'] }),
      ),
    ).toBe(true);
  });

  // Shape 3 — nothing named. Deliberately permissive: ImportJob has exactly one
  // unique constraint besides its primary key, and arbitrate()'s findUnique is
  // what actually decides. Guessing true on some other constraint costs a
  // lookup and a misleading `no job survives` log before the same 500 the
  // rethrow would have given; guessing false on the real one turns an ordinary
  // retry into a 500 that arbitrate would have answered 200 or 409.
  it.each([
    ['no meta at all', p2002(undefined)],
    ['meta with nothing in it', p2002({})],
    ['an adapter error with no constraint', p2002({ driverAdapterError: {} })],
    ['a constraint naming neither an index nor fields', withConstraint({})],
    ['a constraint that is a bare string', withConstraint('some_index')],
  ])('is true when the constraint is unreported: %s', (_name, error) => {
    expect(isIdempotencyConflict(error)).toBe(true);
  });

  // The negative half of shape 1 and 2. Without these the function could
  // return true unconditionally and every test above would still pass.
  it.each([
    ['a different named index', { index: 'ImportJob_pkey' }],
    ['different fields', { fields: ['id'] }],
    ['a field that merely looks similar', { fields: ['idempotency_key'] }],
  ])('is false for %s', (_name, constraint) => {
    expect(isIdempotencyConflict(withConstraint(constraint))).toBe(false);
  });

  // A constraint that reports an empty field list has named nothing, so it
  // belongs with the unreported shapes above rather than with the negatives
  // below. Until violatedConstraint length-checked the array, join(',') gave ''
  // — a string, and therefore a reported-but-not-ours answer that rethrew the
  // P2002 and turned an ordinary retry into a 500.
  it('is true for a constraint reporting an empty field list', () => {
    expect(isIdempotencyConflict(withConstraint({ fields: [] }))).toBe(true);
  });

  // meta.target is where Prisma put the column list before the driver adapter.
  // The rule does not read it; this still returns true, but through the
  // unreported-constraint branch. Pinned so that a future move back off the
  // adapter shows up as a deliberate change rather than a coincidence.
  it('does not read the pre-adapter meta.target shape', () => {
    expect(isIdempotencyConflict(p2002({ target: ['idempotencyKey'] }))).toBe(
      true,
    );
    expect(isIdempotencyConflict(p2002({ target: ['id'] }))).toBe(true);
  });
});

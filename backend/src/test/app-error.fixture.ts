import { AppError } from '../common/errors/app.error';
import type { FieldError } from '../common/errors/error-catalogue';

/**
 * The unit layer's counterpart to asserting on a response body. A thrown
 * AppError carries three things a caller can branch on — code, status and the
 * field errors in `details` — and `expect(fn).toThrow()` can check exactly one
 * of them (the message, which for a validation failure is the same generic
 * string every time). Catching it gives the test the object instead.
 *
 * Rethrows anything that is not an AppError rather than swallowing it: a
 * TypeError from a refactor should surface as itself, not as "expected an
 * AppError".
 */
export function catchAppError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the call to throw an AppError; it returned');
}

/**
 * `details` is typed `unknown` on AppError — it is whatever the thrower passed.
 * Every validation thrower in this codebase passes FieldError[], so assert that
 * shape once here instead of casting at each call site.
 */
export function fieldErrors(error: AppError): FieldError[] {
  expect(Array.isArray(error.details)).toBe(true);
  return error.details as FieldError[];
}

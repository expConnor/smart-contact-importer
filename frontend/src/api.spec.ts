import { describe, expect, it } from 'vitest';
import { ApiError, contactsPath, parseError } from './api';
import type { ContactParams } from './api';

describe('parseError', () => {
  it('reads code and message from the error envelope', () => {
    const error = parseError(401, 'Unauthorized', {
      error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('Invalid credentials');
    expect(error.details).toBeUndefined();
  });

  it('keeps details so field errors reach the UI', () => {
    const details = [{ field: 'email', message: 'email must be an email' }];

    const error = parseError(400, 'Bad Request', {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details,
      },
    });

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual(details);
  });

  // The Vite proxy answers with HTML or nothing when the backend is down, so
  // the body can be anything. Status text is the only honest message left.
  it.each([
    ['an HTML page', 502, 'Bad Gateway', '<html>Bad Gateway</html>'],
    ['no body', 500, 'Internal Server Error', undefined],
    ['JSON without a code', 503, 'Service Unavailable', { error: {} }],
  ])(
    'falls back to INTERNAL for %s',
    (_case, status, statusText, body: unknown) => {
      const error = parseError(status, statusText, body);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(status);
      expect(error.code).toBe('INTERNAL');
      expect(error.message).toBe(statusText);
    },
  );
});

describe('contactsPath', () => {
  const defaults: ContactParams = {
    status: '',
    company: '',
    sort: '-createdAt',
    limit: 50,
  };

  // Empty filters are left out: the API rejects `status=`.
  it('always sends sort and limit, and nothing else by default', () => {
    expect(contactsPath(defaults)).toBe('/contacts?sort=-createdAt&limit=50');
  });

  it('adds a trimmed, encoded status and company', () => {
    expect(
      contactsPath({
        ...defaults,
        status: ' churned ',
        company: '  Acme GmbH ',
      }),
    ).toBe(
      '/contacts?sort=-createdAt&limit=50&status=churned&company=Acme+GmbH',
    );
  });

  it('leaves out a status or company that is only spaces', () => {
    expect(contactsPath({ ...defaults, status: '  ', company: '   ' })).toBe(
      '/contacts?sort=-createdAt&limit=50',
    );
  });

  it('puts the cursor last', () => {
    expect(contactsPath({ ...defaults, status: 'lead' }, 'abc')).toBe(
      '/contacts?sort=-createdAt&limit=50&status=lead&cursor=abc',
    );
  });
});

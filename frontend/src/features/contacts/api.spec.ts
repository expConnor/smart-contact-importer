import { describe, expect, it } from 'vitest';
import { contactsPath } from './api';
import type { ContactParams } from './api';

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

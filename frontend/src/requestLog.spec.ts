import { describe, expect, it } from 'vitest';
import type { ApiCall } from './api';
import { addRow, badMapping, jobIdOf, noteOf, routeOf } from './requestLog';
import type { LogRow } from './requestLog';

const ID = '0199f1c2-7a3b-7c4d-8e5f-0123456789ab';

function call(overrides: Partial<ApiCall>): ApiCall {
  return {
    method: 'GET',
    path: `/imports/${ID}`,
    code: 200,
    body: {},
    ...overrides,
  };
}

function row(overrides: Partial<LogRow>): LogRow {
  return {
    method: 'GET',
    route: '/imports/:id',
    code: 200,
    note: 'PENDING_ANALYSIS',
    count: 1,
    at: 1000,
    ...overrides,
  };
}

describe('jobIdOf', () => {
  it('reads the id from a job path', () => {
    expect(jobIdOf(call({ path: `/imports/${ID}` }))).toBe(ID);
  });

  it('reads the id from a mapping path', () => {
    expect(
      jobIdOf(
        call({ method: 'POST', path: `/imports/${ID}/mapping`, code: 202 }),
      ),
    ).toBe(ID);
  });

  // The upload path has no id yet; the answer carries it.
  it('reads the id from an upload answer', () => {
    expect(
      jobIdOf(
        call({ method: 'POST', path: '/imports', code: 201, body: { id: ID } }),
      ),
    ).toBe(ID);
  });

  // Sidebar polls and contacts would drown the job's rows.
  it.each([
    ['the sidebar list', call({ path: '/imports', body: { items: [] } })],
    ['contacts', call({ path: '/contacts?sort=-createdAt&limit=50' })],
    [
      'a rejected upload',
      call({
        method: 'POST',
        path: '/imports',
        code: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
          },
        },
      }),
    ],
  ])('is null for %s', (_name, apiCall) => {
    expect(jobIdOf(apiCall)).toBeNull();
  });
});

describe('routeOf', () => {
  it('swaps the uuid for :id', () => {
    expect(routeOf(`/imports/${ID}/mapping`)).toBe('/imports/:id/mapping');
  });

  it('leaves a path without an id alone', () => {
    expect(routeOf('/imports')).toBe('/imports');
  });
});

describe('noteOf', () => {
  it('calls a 201 upload a new job', () => {
    expect(
      noteOf(
        call({ method: 'POST', path: '/imports', code: 201, body: { id: ID } }),
      ),
    ).toBe('new job');
  });

  // The idempotency proof: same key, same job, nothing redone.
  it('calls a 200 upload a replay', () => {
    expect(
      noteOf(
        call({ method: 'POST', path: '/imports', code: 200, body: { id: ID } }),
      ),
    ).toBe('replayed · same job, no new work');
  });

  it('shows the job status a poll saw', () => {
    expect(noteOf(call({ body: { id: ID, status: 'AWAITING_MAPPING' } }))).toBe(
      'AWAITING_MAPPING',
    );
  });

  it('shows the status a confirm moved the job to', () => {
    expect(
      noteOf(
        call({
          method: 'POST',
          path: `/imports/${ID}/mapping`,
          code: 202,
          body: { id: ID, status: 'PENDING_IMPORT' },
        }),
      ),
    ).toBe('PENDING_IMPORT');
  });

  // The first issue says what was wrong; the envelope message only says 422.
  it('shows the code and first issue of a rejected mapping', () => {
    expect(
      noteOf(
        call({
          method: 'POST',
          path: `/imports/${ID}/mapping`,
          code: 422,
          body: {
            error: {
              code: 'MAPPING_INVALID',
              message: 'Mapping is invalid',
              details: [
                {
                  field: 'mappings',
                  message:
                    'Column "Not a column in this file" is not in the file',
                },
              ],
            },
          },
        }),
      ),
    ).toBe(
      'MAPPING_INVALID · Column "Not a column in this file" is not in the file',
    );
  });

  it('shows the code and message when there are no details', () => {
    expect(
      noteOf(
        call({
          method: 'POST',
          path: `/imports/${ID}/mapping`,
          code: 409,
          body: { error: { code: 'CONFLICT', message: 'Conflict' } },
        }),
      ),
    ).toBe('CONFLICT · Conflict');
  });
});

describe('addRow', () => {
  it('counts a repeat poll on the last row', () => {
    const rows = addRow([row({})], row({ at: 1250 }));

    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
    // The row keeps the time it was first seen.
    expect(rows[0].at).toBe(1000);
  });

  it('appends a poll that saw a new status', () => {
    const rows = addRow([row({})], row({ note: 'AWAITING_MAPPING', at: 1250 }));

    expect(rows.map((r) => r.note)).toEqual([
      'PENDING_ANALYSIS',
      'AWAITING_MAPPING',
    ]);
  });

  // Two Replay clicks are two requests the reviewer made on purpose.
  it('never merges two equal POSTs', () => {
    const replay = row({
      method: 'POST',
      route: '/imports',
      note: 'replayed · same job, no new work',
    });

    expect(addRow([replay], { ...replay, at: 2000 })).toHaveLength(2);
  });

  // The store hands rows to useSyncExternalStore, which needs a new array.
  it('does not change the rows it was given', () => {
    const rows = [row({})];

    addRow(rows, row({ at: 1250 }));

    expect(rows).toEqual([row({})]);
  });
});

describe('badMapping', () => {
  const job = {
    headerRowIndex: 3,
    proposedMapping: [
      {
        sourceColumn: 'Email Address',
        targetField: 'email' as const,
        confidence: 0.95,
      },
      {
        sourceColumn: 'First Name',
        targetField: 'name' as const,
        confidence: 0.88,
      },
    ],
  };

  it('renames the first column to one the file does not have', () => {
    expect(badMapping(job)).toEqual({
      headerRowIndex: 3,
      mappings: [
        {
          sourceColumn: 'Not a column in this file',
          targetField: 'email',
          confidence: 0.95,
        },
        { sourceColumn: 'First Name', targetField: 'name', confidence: 0.88 },
      ],
    });
  });
});

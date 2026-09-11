// Contact rows for e2e specs.
//
// The builder exists so a test states only the field it is about. Everything
// else takes a default that is deliberately boring, and every default that
// MUST differ between rows (the two unique columns, and the ordering key)
// differs by construction rather than by the caller remembering to vary it.
//
// aContact does not touch the database. It returns a complete row, which is
// what lets a spec hand the same object to seedContacts and to its own
// expectation without either one going through the mapper under test.

import { randomUUID } from 'node:crypto';
import { testDb } from '../db.fixture';
import type { Contact } from '../../generated/prisma/client';

/**
 * The first createdAt. Fixed, not `now()`: a test that asserts on an ISO string
 * has to be able to write that string down, and a suite whose rows drift with
 * the wall clock cannot.
 */
const FIRST_CREATED_AT = Date.UTC(2026, 8, 1); // 2026-09-01T00:00:00.000Z

/** One second between consecutive rows — far wider than Timestamptz(3). */
const SPACING_MS = 1000;

/**
 * Bumped once per aContact() call and never reset. The TRUNCATE empties the
 * table between tests, so a number never has to come back around; what matters
 * is that two rows built anywhere in one spec file cannot collide.
 */
let seq = 0;

/**
 * A complete Contact row.
 *
 * Defaults mirror schema.prisma's own column defaults (`''` for the five text
 * columns), so an un-overridden row is exactly the row a minimal INSERT would
 * produce — a builder that quietly invented richer data than the application
 * does would hide the empty-string cases rather than cover them.
 *
 * The three defaults that are NOT the schema's:
 *
 * - `id` and `email` are unique indexes, so they are generated per call.
 * - `createdAt` increases by one second per call, making build order the
 *   default sort order (`-createdAt` → newest first → the reverse of the order
 *   the rows were built in). Tests state their expected order against that and
 *   do not have to pass timestamps they do not care about.
 *
 * `updatedAt` tracks createdAt. It is `@updatedAt` in the schema, but Prisma
 * still honours an explicit value on create — verified, not assumed.
 */
export function aContact(overrides: Partial<Contact> = {}): Contact {
  const n = ++seq;
  const createdAt = new Date(FIRST_CREATED_AT + n * SPACING_MS);

  return {
    id: randomUUID(),
    email: `contact${n}@test.com`,
    name: '',
    company: '',
    jobTitle: '',
    phone: '',
    status: '',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

/**
 * INSERTs the rows and hands them back, so a spec can seed and destructure in
 * one expression.
 *
 * Call from a test body or a `beforeEach` — never `beforeAll`, which runs
 * before setup-e2e.ts's TRUNCATE and so seeds rows the first test wipes.
 *
 * One statement for the whole array: the 51-row and shared-company cases would
 * otherwise pay a round trip per row.
 */
export async function seedContacts(rows: Contact[]): Promise<Contact[]> {
  await testDb().contact.createMany({ data: rows });
  return rows;
}

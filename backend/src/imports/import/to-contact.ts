import type { ColumnMapping } from '../types';

export type ContactFields = {
  email: string;
  name: string;
  company: string;
  jobTitle: string;
  phone: string;
  status: string;
};

export type RowResult =
  { ok: true; contact: ContactFields } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One data row → a contact, or the reason it is not one.
 *
 * Only the email can fail a row. Every other field is trimmed and kept as
 * typed. A mapped column is found by its leftmost header, the same column the
 * mapping was validated against. Missing cells read as ''.
 */
export function toContact(
  cells: string[],
  headers: string[],
  mappings: ColumnMapping[],
): RowResult {
  const contact: ContactFields = {
    email: '',
    name: '',
    company: '',
    jobTitle: '',
    phone: '',
    status: '',
  };

  for (const { sourceColumn, targetField } of mappings) {
    if (targetField === '__ignore__') continue;
    contact[targetField] = (cells[headers.indexOf(sourceColumn)] ?? '').trim();
  }

  contact.email = contact.email.toLowerCase();
  if (contact.email === '') return { ok: false, error: 'Email is missing' };
  if (!EMAIL.test(contact.email)) {
    return { ok: false, error: 'Email is not a valid address' };
  }
  return { ok: true, contact };
}

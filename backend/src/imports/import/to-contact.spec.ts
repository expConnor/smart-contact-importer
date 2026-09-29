import { toContact } from './to-contact';
import type { ColumnMapping, TargetField } from '../types';

// partial-rows.csv's header, so the cases read like rows of that file.
const HEADERS = ['Full Name', 'Email', 'Company', 'Title', 'Phone', 'Status'];

const entry = (
  sourceColumn: string,
  targetField: TargetField,
): ColumnMapping => ({ sourceColumn, targetField, confidence: 0.9 });

const MAPPINGS = [
  entry('Full Name', 'name'),
  entry('Email', 'email'),
  entry('Company', 'company'),
  entry('Title', 'jobTitle'),
  entry('Phone', 'phone'),
  entry('Status', 'status'),
];

describe('toContact', () => {
  it('maps every field, trimming each cell', () => {
    const cells = [
      ' Rosa Silva ',
      ' rosa.silva@meridianlabs.test ',
      ' Meridian Labs ',
      ' Data Analyst ',
      ' +351 21 099 3312 ',
      ' lead ',
    ];

    expect(toContact(cells, HEADERS, MAPPINGS)).toEqual({
      ok: true,
      contact: {
        email: 'rosa.silva@meridianlabs.test',
        name: 'Rosa Silva',
        company: 'Meridian Labs',
        jobTitle: 'Data Analyst',
        phone: '+351 21 099 3312',
        status: 'lead',
      },
    });
  });

  it('lowercases the email', () => {
    const cells = ['', 'Rosa.Silva@MeridianLabs.TEST', '', '', '', ''];

    expect(toContact(cells, HEADERS, MAPPINGS)).toMatchObject({
      ok: true,
      contact: { email: 'rosa.silva@meridianlabs.test' },
    });
  });

  // Only the fatal field is changed. A tolerated field that looks wrong is
  // stored exactly as typed, case included.
  it('keeps tolerated fields as-is, odd ones included', () => {
    const cells = [
      'NADIA haddad',
      'nadia.haddad@sableandroe.test',
      'Sable & Roe',
      'founder',
      'ext. 4471',
      'Ehemaliger Kunde',
    ];

    expect(toContact(cells, HEADERS, MAPPINGS)).toEqual({
      ok: true,
      contact: {
        email: 'nadia.haddad@sableandroe.test',
        name: 'NADIA haddad',
        company: 'Sable & Roe',
        jobTitle: 'founder',
        phone: 'ext. 4471',
        status: 'Ehemaliger Kunde',
      },
    });
  });

  it('leaves unmapped and ignored fields empty', () => {
    const cells = ['Rosa Silva', 'rosa.silva@meridianlabs.test', 'Meridian'];
    const mappings = [entry('Email', 'email'), entry('Company', '__ignore__')];

    expect(toContact(cells, HEADERS, mappings)).toEqual({
      ok: true,
      contact: {
        email: 'rosa.silva@meridianlabs.test',
        name: '',
        company: '',
        jobTitle: '',
        phone: '',
        status: '',
      },
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
  ])('rejects an email that is %s as missing', (_label, email) => {
    const cells = ['Sven Jensen', email, 'Copperline Energy', '', '', ''];

    expect(toContact(cells, HEADERS, MAPPINGS)).toEqual({
      ok: false,
      error: 'Email is missing',
    });
  });

  it.each([
    'ivo[at]orbitalmedia.test',
    'ivo@orbitalmedia',
    'ivo petrov@orbitalmedia.test',
    '@orbitalmedia.test',
    'ivo@@orbitalmedia.test',
  ])('rejects %s as not a valid address', (email) => {
    const cells = ['Ivo Petrov', email, '', '', '', ''];

    expect(toContact(cells, HEADERS, MAPPINGS)).toEqual({
      ok: false,
      error: 'Email is not a valid address',
    });
  });

  describe('a row whose width does not match the header', () => {
    it('reads missing cells as empty', () => {
      const cells = ['Hana Nakamura', 'hana.nakamura@juniperdental.test'];

      expect(toContact(cells, HEADERS, MAPPINGS)).toEqual({
        ok: true,
        contact: {
          email: 'hana.nakamura@juniperdental.test',
          name: 'Hana Nakamura',
          company: '',
          jobTitle: '',
          phone: '',
          status: '',
        },
      });
    });

    // Short enough to lose the email cell itself: that is a missing email,
    // not a crash on an undefined cell.
    it('reports a row cut off before the email as missing', () => {
      expect(toContact(['Hana Nakamura'], HEADERS, MAPPINGS)).toEqual({
        ok: false,
        error: 'Email is missing',
      });
    });

    it('ignores cells past the last header', () => {
      const cells = [
        'Rosa Silva',
        'rosa.silva@meridianlabs.test',
        'Meridian Labs',
        'Data Analyst',
        '+351 21 099 3312',
        'lead',
        'stray',
        'cells',
      ];

      expect(toContact(cells, HEADERS, MAPPINGS)).toMatchObject({
        ok: true,
        contact: { status: 'lead' },
      });
    });
  });

  // The mapping was validated against this header list, where a repeated name
  // means the leftmost column. The import must read the same column.
  it('reads the leftmost column when a header repeats', () => {
    const headers = ['Email', 'Name', 'Email'];
    const cells = ['first@example.test', 'Ada', 'second@example.test'];
    const mappings = [entry('Email', 'email'), entry('Name', 'name')];

    expect(toContact(cells, headers, mappings)).toMatchObject({
      ok: true,
      contact: { email: 'first@example.test', name: 'Ada' },
    });
  });
});

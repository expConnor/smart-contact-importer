import Papa from 'papaparse';
import { decode } from './decode';
import { countDataRows, rowStream, sniff } from './sniff';
import { csvFixture, fixturePath } from '../../test/builders/upload.builder';

// The five SPEC fixtures, partial-rows.csv and path-guess-rejected.csv, with
// every number this unit is supposed to produce for them. Listed rather than
// globbed for the reason decode.spec.ts gives: a glob that matched nothing
// leaves the suite green with no cases in it. `totalRows` is
// fixtures/README.md's column, not a number derived from the code under test.
const FIXTURES = [
  { name: 'clean.csv', delimiter: ',', headerRowIndex: 0, totalRows: 10 },
  {
    name: 'linkedin-connections.csv',
    delimiter: ',',
    headerRowIndex: 3,
    totalRows: 10,
  },
  {
    name: 'google-contacts.csv',
    delimiter: ',',
    headerRowIndex: 0,
    totalRows: 8,
  },
  {
    name: 'typeform-responses.csv',
    delimiter: ',',
    headerRowIndex: 0,
    totalRows: 6,
  },
  { name: 'excel-de.csv', delimiter: ';', headerRowIndex: 0, totalRows: 10 },
  { name: 'partial-rows.csv', delimiter: ',', headerRowIndex: 0, totalRows: 5 },
  {
    name: 'path-guess-rejected.csv',
    delimiter: ',',
    headerRowIndex: 0,
    totalRows: 276,
  },
];

const textOf = (name: string) => decode(csvFixture(name).body).text;

describe('sniff', () => {
  // These two also pin papaparse's guesser. It is not our algorithm, so an
  // upgrade that changes it has to go red here rather than in production.
  it.each(FIXTURES)(
    'reads $name as $delimiter-delimited',
    ({ name, delimiter }) => {
      expect(sniff(textOf(name)).delimiter).toBe(delimiter);
    },
  );

  it.each(FIXTURES)(
    'puts the header of $name at row $headerRowIndex',
    ({ name, headerRowIndex }) => {
      expect(sniff(textOf(name)).headerRowIndex).toBe(headerRowIndex);
    },
  );

  // Not a test of sniff — a test of the reason sniff pins skipEmptyLines to
  // false. Papa drops the blank preamble line and every index below it shifts
  // up, so the header SPEC calls row 3 would be reported as row 2. The
  // headers themselves are identical either way, which is what makes this
  // worth an assertion: nothing else would notice.
  it('would misplace the LinkedIn header if empty lines were skipped', () => {
    const text = textOf('linkedin-connections.csv');

    const skipped = Papa.parse<string[]>(text, {
      delimiter: ',',
      skipEmptyLines: true,
      header: false,
    }).data;

    expect(skipped[2]?.[0]).toBe('First Name');
    expect(sniff(text).headerRowIndex).toBe(3);
    expect(sniff(text).headers[0]).toBe('First Name');
  });

  // The header only parses as 12 cells under correct quoting. Split blind it
  // is 13, no longer matches the modal width, and locateHeader walks past it
  // to the first data row.
  it('keeps a comma inside a quoted header cell', () => {
    const { headers } = sniff(textOf('typeform-responses.csv'));

    expect(headers).toHaveLength(12);
    expect(headers).toContain(
      "If you had to pick one, what's your role there?",
    );
  });

  // The adversarial shape no fixture has: every comma in the file is inside a
  // quoted cell, so a counter that ignored quoting would see commas winning.
  it('picks the semicolon when every comma is inside a quoted cell', () => {
    const csv = [
      'Name;Note',
      '"Okafor, Ada";"ops, logistics, freight"',
      '"Lindqvist, Bea";"sales, crm"',
      '"Abara, Cyrus";"procurement, legal"',
    ].join('\n');

    const result = sniff(csv);

    expect(result.delimiter).toBe(';');
    expect(result.headers).toEqual(['Name', 'Note']);
    expect(result.sampleRows[0]).toEqual([
      'Okafor, Ada',
      'ops, logistics, freight',
    ]);
  });

  it('samples at most five rows, taken from below the header', () => {
    const { sampleRows } = sniff(textOf('linkedin-connections.csv'));

    expect(sampleRows).toHaveLength(5);
    expect(sampleRows[0]?.[0]).toBe('Kai');
  });

  // Totality at the boundary: the caller turns this into a failed job, and it
  // can only do that if sniff returns rather than throws.
  it('returns no header and no rows for an empty file', () => {
    expect(sniff('')).toEqual({
      delimiter: ',',
      headerRowIndex: -1,
      headers: [],
      sampleRows: [],
    });
  });
});

describe('countDataRows', () => {
  // linkedin-connections.csv is the case that fails if the counting pass and
  // sniff disagree about whether blank lines are rows.
  it.each(FIXTURES)(
    'counts $totalRows data rows in $name',
    async ({ name, totalRows }) => {
      const { encoding } = decode(csvFixture(name).body);
      const { delimiter, headerRowIndex } = sniff(textOf(name));

      await expect(
        countDataRows(fixturePath(name), encoding, delimiter, headerRowIndex),
      ).resolves.toBe(totalRows);
    },
  );
});

describe('rowStream', () => {
  // A row count survives a mangled decode unchanged, so the encoding label has
  // to be proved on a cell.
  it('decodes windows-1252 off the stream rather than mangling it', async () => {
    const rows: string[][] = [];
    for await (const row of rowStream(
      fixturePath('excel-de.csv'),
      'windows-1252',
      ';',
    )) {
      rows.push(row);
    }

    expect(rows[0]).toContain('Nachname');
    expect(rows[1]).toContain('Müller');
  });

  // `.pipe()` does not forward errors. Without the forwarding in rowStream
  // this test does not fail — it hangs, and so would a worker.
  it('rejects rather than hanging when the file is missing', async () => {
    const drain = async () => {
      const rows: string[][] = [];
      for await (const row of rowStream(
        fixturePath('nope.csv'),
        'utf-8',
        ',',
      )) {
        rows.push(row);
      }
    };

    await expect(drain()).rejects.toThrow(/ENOENT/);
  });
});

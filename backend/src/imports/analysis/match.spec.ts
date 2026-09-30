import { decode } from './decode';
import { match } from './match';
import { sniff } from './sniff';
import type { ColumnMapping, TargetField } from '../types';
import { csvFixture } from '../../test/builders/upload.builder';

// The design doc's "Expected per fixture" table, as data. `mapped` is the
// columns that land on a field; `maybe` is the columns ignored at 0.5. Every
// other header is expected as `__ignore__` at 0.9. Listed rather than globbed
// for the reason decode.spec.ts gives.
//
// Confidences are compared exactly, not with toBeCloseTo: they go into the
// preview's JSON, and a naive `0.7 - 0.2` shows up there as
// 0.49999999999999994.
const FIXTURES: {
  name: string;
  mapped: Record<string, [TargetField, number]>;
  maybe: string[];
}[] = [
  {
    name: 'clean.csv',
    mapped: {
      Name: ['name', 0.9],
      Email: ['email', 0.9],
      Company: ['company', 0.9],
      'Job Title': ['jobTitle', 0.9],
      Phone: ['phone', 0.9],
      Status: ['status', 0.9],
    },
    maybe: [],
  },
  {
    name: 'linkedin-connections.csv',
    mapped: {
      'First Name': ['name', 0.5],
      'Email Address': ['email', 0.9],
      Company: ['company', 0.9],
      Position: ['jobTitle', 0.9],
    },
    maybe: ['Last Name'],
  },
  {
    name: 'google-contacts.csv',
    mapped: {
      Name: ['name', 0.9],
      'E-mail 1 - Value': ['email', 0.9],
      'Organization 1 - Name': ['company', 0.9],
      'Organization 1 - Title': ['jobTitle', 0.9],
      'Phone 1 - Value': ['phone', 0.7],
    },
    maybe: ['Given Name', 'Family Name', 'Phone 2 - Value', 'Phone 3 - Value'],
  },
  {
    name: 'typeform-responses.csv',
    mapped: {
      "What's your full name?": ['name', 0.7],
      "What's your work email address?": ['email', 0.7],
      'Which company do you work for?': ['company', 0.7],
      "If you had to pick one, what's your role there?": ['jobTitle', 0.7],
      "What's the best number to reach you on?": ['phone', 0.6],
    },
    maybe: [],
  },
  {
    name: 'excel-de.csv',
    mapped: {
      Vorname: ['name', 0.5],
      Firma: ['company', 0.9],
      Position: ['jobTitle', 0.9],
      'E-Mail': ['email', 0.9],
      Telefon: ['phone', 0.9],
      Status: ['status', 0.9],
    },
    maybe: ['Nachname'],
  },
  {
    // The rules know no French: only the `mail` keyword and the exact
    // `telephone` hit. `Nom` is the surname, so leaving it unmapped is the
    // safe miss.
    name: 'excel-fr.csv',
    mapped: {
      'Adresse e-mail': ['email', 0.7],
      Téléphone: ['phone', 0.9],
    },
    maybe: [],
  },
  {
    name: 'partial-rows.csv',
    mapped: {
      'Full Name': ['name', 0.9],
      Email: ['email', 0.9],
      Company: ['company', 0.9],
      Title: ['jobTitle', 0.9],
      Phone: ['phone', 0.9],
      Status: ['status', 0.9],
    },
    maybe: [],
  },
];

/** The real pipeline up to the matcher: bytes → decode → sniff → match. */
const analyse = (name: string) => {
  const { headers, sampleRows } = sniff(decode(csvFixture(name).body).text);
  return { headers, mappings: match(headers, sampleRows) };
};

/** One fixture's result as `{ header: [targetField, confidence] }`. */
const resultOf = (name: string) =>
  Object.fromEntries(
    analyse(name).mappings.map((m) => [
      m.sourceColumn,
      [m.targetField, m.confidence],
    ]),
  );

describe('match', () => {
  it.each(FIXTURES)(
    'maps $name as the design table says',
    ({ name, mapped, maybe }) => {
      const { headers, mappings } = analyse(name);

      const expected = headers.map((sourceColumn): ColumnMapping => {
        const hit = mapped[sourceColumn];
        return hit
          ? { sourceColumn, targetField: hit[0], confidence: hit[1] }
          : {
              sourceColumn,
              targetField: '__ignore__',
              confidence: maybe.includes(sourceColumn) ? 0.5 : 0.9,
            };
      });

      expect(mappings).toEqual(expected);
    },
  );

  // Implied by the table test, which builds its expectation from the headers.
  // Kept apart so a dropped or reordered column fails under its own name
  // rather than as a 73-row diff.
  it.each(FIXTURES)(
    'lists every header of $name once, in order',
    ({ name }) => {
      const { headers, mappings } = analyse(name);

      expect(mappings.map((m) => m.sourceColumn)).toEqual(headers);
    },
  );

  // SPEC's named trap. `Organization 1 - Name` also contains the word `name`,
  // so it is a candidate for two fields; the exact rule has to win.
  it('does not swap Google Organization 1 - Name and - Title', () => {
    const google = resultOf('google-contacts.csv');

    expect(google['Organization 1 - Name']).toEqual(['company', 0.9]);
    expect(google['Organization 1 - Title']).toEqual(['jobTitle', 0.9]);
  });

  // Phone 1..5 - Value all hit the exact rule at 0.9. Phone 1 wins, then
  // drops to 0.7 because Phone 2 and 3 hold numbers too; those two are the
  // real alternatives, so they sit at 0.5. Phone 4 is empty: not an
  // alternative, so 0.9.
  it('marks Google Phone 1 - Value as a contested choice', () => {
    const google = resultOf('google-contacts.csv');

    expect(google['Phone 1 - Value']).toEqual(['phone', 0.7]);
    expect(google['Phone 2 - Value']).toEqual(['__ignore__', 0.5]);
    expect(google['Phone 3 - Value']).toEqual(['__ignore__', 0.5]);
    expect(google['Phone 4 - Value']).toEqual(['__ignore__', 0.9]);
  });

  // E-mail 2 - Value ties E-mail 1 - Value on the exact rule too, but it is
  // empty. An empty runner-up is not a choice, so nothing is marked down.
  it('does not mark Google E-mail 1 - Value down for an empty rival', () => {
    const google = resultOf('google-contacts.csv');

    expect(google['E-mail 1 - Value']).toEqual(['email', 0.9]);
    expect(google['E-mail 2 - Value']).toEqual(['__ignore__', 0.9]);
  });

  // Both headers hit a keyword (`mail`, `phone`) and both have data, so if
  // the veto did not drop them they would lose their field and sit at 0.5.
  // 0.9 is what proves they were dropped rather than merely outranked.
  it('vetoes Google type columns whose samples are not emails or phones', () => {
    const google = resultOf('google-contacts.csv');

    expect(google['E-mail 1 - Type']).toEqual(['__ignore__', 0.9]);
    expect(google['Phone 1 - Type']).toEqual(['__ignore__', 0.9]);
  });

  // No word in this header names a field; only the samples do.
  it('maps the Typeform phone question on its samples alone', () => {
    const typeform = resultOf('typeform-responses.csv');

    expect(typeform["What's the best number to reach you on?"]).toEqual([
      'phone',
      0.6,
    ]);
  });

  // No fixture tests D8's shape tie-break: in every one, the fullest column
  // is also the leftmost. Here it is not. Both headers are exact phone hits
  // at 0.9, and `Mobile` wins on three good samples to one.
  it('breaks a tie on the column with more well-shaped samples', () => {
    const mappings = match(
      ['Phone', 'Mobile'],
      [
        ['', '+44 7700 900142'],
        ['+44 20 7946 0812', '+1 415 555 0188'],
        ['', '+46 70 123 45 67'],
      ],
    );

    expect(mappings).toEqual([
      { sourceColumn: 'Phone', targetField: '__ignore__', confidence: 0.5 },
      { sourceColumn: 'Mobile', targetField: 'phone', confidence: 0.7 },
    ]);
  });

  // No fixture tests D5's whole-word rule either: Google's `Nickname` is
  // empty, so it lands at 0.9 whether it was a name candidate or not.
  it('does not read `name` inside `Nickname`', () => {
    expect(match(['Nickname'], [['Ada']])).toEqual([
      { sourceColumn: 'Nickname', targetField: '__ignore__', confidence: 0.9 },
    ]);
  });

  // What an empty upload actually hands the matcher, via sniff's own empty
  // result rather than a literal `[]`.
  it('returns no mappings for an empty file', () => {
    const { headers, sampleRows } = sniff('');

    expect(match(headers, sampleRows)).toEqual([]);
  });
});

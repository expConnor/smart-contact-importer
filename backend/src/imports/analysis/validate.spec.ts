import { decode } from './decode';
import { match } from './match';
import { sniff } from './sniff';
import { validateMapping } from './validate';
import { csvFixture } from '../../test/builders/upload.builder';

// Listed rather than globbed for the reason decode.spec.ts gives.
const FIXTURES = [
  'clean.csv',
  'linkedin-connections.csv',
  'google-contacts.csv',
  'typeform-responses.csv',
  'excel-de.csv',
  'partial-rows.csv',
];

/** Bytes → decode → sniff. Its result goes into the validator unchanged. */
const sniffed = (name: string) => sniff(decode(csvFixture(name).body).text);

// Name, Email, Company, Job Title, Phone, Status. Header at row 0.
const CLEAN = sniffed('clean.csv');

// Header at row 3, under a notes preamble. The one fixture where the detected
// row is not 0, so a wrong row cannot pass by accident.
const LINKEDIN = sniffed('linkedin-connections.csv');

/** One mapping entry. `targetField` is a plain string so a bad one can go in. */
const entry = (
  sourceColumn: string,
  targetField: string,
  confidence = 0.9,
) => ({
  sourceColumn,
  targetField,
  confidence,
});

describe('validateMapping', () => {
  // Lists 2 of the 6 columns: a column left out means `__ignore__` (D9).
  // `toEqual` fails on an extra key with a value, so this also proves the
  // extras were dropped rather than passed through to the DB.
  it('accepts a valid mapping and strips unknown keys', () => {
    const payload = {
      headerRowIndex: 0,
      mappings: [
        { ...entry('Email', 'email'), reason: 'exact header' },
        entry('Name', 'name', 0.7),
      ],
      model: 'some-llm',
    };

    expect(validateMapping(CLEAN, payload)).toEqual({
      ok: true,
      mapping: {
        headerRowIndex: 0,
        mappings: [entry('Email', 'email'), entry('Name', 'name', 0.7)],
      },
    });
  });

  // SPEC test 2, the "rejected" half: a model that invents a column. Index 1,
  // not 0, so the path is proved to carry the entry's position.
  it('rejects a sourceColumn that is not in the file', () => {
    const payload = {
      headerRowIndex: 0,
      mappings: [entry('Email', 'email'), entry('Surname', 'name')],
    };

    expect(validateMapping(CLEAN, payload)).toEqual({
      ok: false,
      issues: [
        {
          field: 'mappings.1.sourceColumn',
          message: '"Surname" is not a column in the file',
        },
      ],
    });
  });

  // D8: exact match, no case folding, no trim. The entry still targets email,
  // so "no email" does not fire on top.
  it.each(['email', 'EMAIL', ' Email', 'Email '])(
    'rejects "%s" against the header "Email"',
    (sourceColumn) => {
      const payload = {
        headerRowIndex: 0,
        mappings: [entry(sourceColumn, 'email')],
      };

      expect(validateMapping(CLEAN, payload)).toEqual({
        ok: false,
        issues: [
          {
            field: 'mappings.0.sourceColumn',
            message: `"${sourceColumn}" is not a column in the file`,
          },
        ],
      });
    },
  );

  // The second claimant gets the issue; the first stays clean.
  it('rejects a second column mapped to the same field', () => {
    const payload = {
      headerRowIndex: 0,
      mappings: [
        entry('Email', 'email'),
        entry('Phone', 'phone'),
        entry('Status', 'phone'),
      ],
    };

    expect(validateMapping(CLEAN, payload)).toEqual({
      ok: false,
      issues: [
        {
          field: 'mappings.2.targetField',
          message: 'phone is already mapped from "Phone"',
        },
      ],
    });
  });

  // Different targets, so only the column check can catch it.
  it('rejects the same column listed twice', () => {
    const payload = {
      headerRowIndex: 0,
      mappings: [
        entry('Email', 'email'),
        entry('Phone', 'phone'),
        entry('Phone', '__ignore__'),
      ],
    };

    expect(validateMapping(CLEAN, payload)).toEqual({
      ok: false,
      issues: [
        {
          field: 'mappings.2.sourceColumn',
          message: '"Phone" is mapped more than once',
        },
      ],
    });
  });

  // An empty list is well-shaped, so it reaches this check too.
  it('rejects a mapping with no email column', () => {
    const noEmail = {
      ok: false,
      issues: [{ field: 'mappings', message: 'No column is mapped to email' }],
    };

    expect(
      validateMapping(CLEAN, {
        headerRowIndex: 0,
        mappings: [entry('Name', 'name')],
      }),
    ).toEqual(noEmail);
    expect(validateMapping(CLEAN, { headerRowIndex: 0, mappings: [] })).toEqual(
      noEmail,
    );
  });

  // D10: `__ignore__` is the one target without a single owner.
  it('accepts __ignore__ on more than one column', () => {
    const payload = {
      headerRowIndex: 0,
      mappings: [
        entry('Email', 'email'),
        entry('Phone', '__ignore__'),
        entry('Status', '__ignore__'),
      ],
    };

    expect(validateMapping(CLEAN, payload)).toEqual({
      ok: true,
      mapping: payload,
    });
  });

  // D11: analysis owns the header row. 0 is the natural wrong guess for a file
  // whose header is really at 3.
  it('rejects a header row other than the detected one', () => {
    const payload = {
      headerRowIndex: 0,
      mappings: [entry('Email Address', 'email')],
    };

    expect(validateMapping(LINKEDIN, payload)).toEqual({
      ok: false,
      issues: [
        {
          field: 'headerRowIndex',
          message: 'Header row must be 3, the row analysis detected',
        },
      ],
    });
  });

  // D12: no fixture has a duplicate header, so this one is built by hand. The
  // name means the leftmost column, and naming it once is not a duplicate.
  it('accepts a header name the file itself repeats', () => {
    const file = { headers: ['Phone', 'Phone', 'Email'], headerRowIndex: 0 };
    const payload = {
      headerRowIndex: 0,
      mappings: [entry('Phone', 'phone'), entry('Email', 'email')],
    };

    expect(validateMapping(file, payload)).toEqual({
      ok: true,
      mapping: payload,
    });
  });

  // D6: a shape failure returns zod's issues and nothing else. Each object
  // payload below also has an unknown column and no email, so a semantic check
  // that ran anyway would add issues and break the exact list. Messages are
  // zod's own wording, so only the field is pinned.
  it.each([
    { label: 'null', payload: null, field: '' },
    { label: 'a string', payload: 'x', field: '' },
    {
      label: 'an unknown targetField',
      payload: { headerRowIndex: 0, mappings: [entry('Nope', 'surname')] },
      field: 'mappings.0.targetField',
    },
    {
      label: 'a confidence above 1',
      payload: { headerRowIndex: 0, mappings: [entry('Nope', 'name', 1.5)] },
      field: 'mappings.0.confidence',
    },
    {
      label: 'a fractional headerRowIndex',
      payload: { headerRowIndex: 2.5, mappings: [entry('Nope', 'name')] },
      field: 'headerRowIndex',
    },
  ])('returns only the shape issue for $label', ({ payload, field }) => {
    const anyString = expect.any(String) as unknown as string;

    expect(validateMapping(CLEAN, payload)).toEqual({
      ok: false,
      issues: [{ field, message: anyString }],
    });
  });

  // D7: every issue, not the first. Order is not part of the contract.
  it('reports three faults as three issues', () => {
    const payload = {
      headerRowIndex: 0,
      mappings: [
        entry('Surname', 'name'),
        entry('Phone', 'phone'),
        entry('Status', 'phone'),
      ],
    };

    const result = validateMapping(CLEAN, payload);
    const issues = result.ok ? [] : result.issues;

    expect(issues).toHaveLength(3);
    expect(issues).toEqual(
      expect.arrayContaining([
        {
          field: 'mappings.0.sourceColumn',
          message: '"Surname" is not a column in the file',
        },
        {
          field: 'mappings.2.targetField',
          message: 'phone is already mapped from "Phone"',
        },
        { field: 'mappings', message: 'No column is mapped to email' },
      ]),
    );
  });

  // The heuristic's proposal has to pass the check it will be held to. If
  // these two disagree, every analysed file ships with a mapping the preview
  // flags as broken.
  it.each(FIXTURES)("accepts the matcher's proposal for %s", (name) => {
    const file = sniffed(name);
    const payload = {
      headerRowIndex: file.headerRowIndex,
      mappings: match(file.headers, file.sampleRows),
    };

    expect(validateMapping(file, payload)).toEqual({
      ok: true,
      mapping: payload,
    });
  });
});

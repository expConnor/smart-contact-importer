import type { ColumnMapping, TargetField } from '../types';

type Field = Exclude<TargetField, '__ignore__'>;

type Rule = {
  exact: string[];
  keywords: string[];
  shape?: (value: string) => boolean;
};

type Candidate = {
  column: number;
  field: Field;
  confidence: number;
  shapeHits: number;
  hasData: boolean;
};

const EXACT = 0.9;
const KEYWORD = 0.7;
const SHAPE = 0.6;
const CONTESTED_PENALTY = 0.2;
const IGNORED_MAYBE = 0.5;
const IGNORED_SURE = 0.9;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d\s().\-/]+$/;
const PHONE_MIN_DIGITS = 7;

// The design doc's Rules table. `exact` is compared with the normalized header
// (D3), `keywords` with its whole words (D5). What is left out on purpose, and
// what it would wrongly catch, is listed there.
const RULES: Record<Field, Rule> = {
  email: {
    exact: ['email', 'emailaddress', 'emailvalue', 'mail', 'emailadresse'],
    keywords: ['email', 'mail'],
    shape: (value) => EMAIL.test(value),
  },
  name: {
    exact: ['name', 'fullname', 'contactname', 'displayname'],
    keywords: ['name', 'vorname', 'nachname'],
  },
  company: {
    exact: [
      'company',
      'companyname',
      'organization',
      'organizationname',
      'organisation',
      'firma',
      'unternehmen',
    ],
    keywords: ['company', 'employer', 'firma'],
  },
  jobTitle: {
    exact: ['jobtitle', 'title', 'position', 'role', 'organizationtitle'],
    keywords: ['title', 'position', 'role'],
  },
  phone: {
    exact: [
      'phone',
      'phonenumber',
      'phonevalue',
      'telephone',
      'mobile',
      'telefon',
    ],
    keywords: ['phone', 'telephone', 'mobile', 'cell', 'telefon'],
    shape: (value) =>
      PHONE.test(value) && value.replace(/\D/g, '').length >= PHONE_MIN_DIGITS,
  },
  status: {
    exact: ['status', 'leadstatus', 'stage'],
    keywords: ['status', 'stage'],
  },
};

const FIELDS = Object.keys(RULES) as Field[];

/**
 * One proposed mapping per header, in header order, from headers and samples.
 *
 * Total: `[]` in gives `[]` out, and nothing throws. The result is a proposal
 * the user confirms at the preview.
 */
export function match(
  headers: string[],
  sampleRows: string[][],
): ColumnMapping[] {
  const candidates = headers.flatMap((header, column) =>
    candidatesFor(
      header,
      sampleRows
        .map((row) => (row[column] ?? '').trim())
        .filter((value) => value !== ''),
      column,
    ),
  );
  const winners = assign(candidates);

  return headers.map((sourceColumn, column): ColumnMapping => {
    const win = winners.find((w) => w.column === column);

    if (win) {
      return {
        sourceColumn,
        targetField: win.field,
        confidence: isContested(win, candidates)
          ? // Rounded because `0.7 - 0.2` is 0.49999999999999994, and this
            // number goes into the preview's JSON.
            Math.round((win.confidence - CONTESTED_PENALTY) * 10) / 10
          : win.confidence,
      };
    }

    const lost = candidates.some((c) => c.column === column && c.hasData);
    return {
      sourceColumn,
      targetField: '__ignore__',
      confidence: lost ? IGNORED_MAYBE : IGNORED_SURE,
    };
  });
}

function candidatesFor(
  header: string,
  values: string[],
  column: number,
): Candidate[] {
  const folded = fold(header);
  const normalized = folded.replace(/[^a-z]/g, '');
  const words = folded.split(/[^a-z]+/);
  const hasData = values.length > 0;

  return FIELDS.flatMap((field): Candidate[] => {
    const { exact, keywords, shape } = RULES[field];
    const shapeHits = shape ? values.filter(shape).length : 0;

    if (shape && hasData && shapeHits === 0) return [];

    const fromHeader = exact.includes(normalized)
      ? EXACT
      : keywords.some((keyword) => words.includes(keyword))
        ? KEYWORD
        : 0;
    const fromShape =
      shape && hasData && shapeHits * 2 >= values.length ? SHAPE : 0;
    const confidence = Math.max(fromHeader, fromShape);

    return confidence > 0
      ? [{ column, field, confidence, shapeHits, hasData }]
      : [];
  });
}

function assign(candidates: Candidate[]): Candidate[] {
  const ranked = [...candidates].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.shapeHits - a.shapeHits ||
      a.column - b.column,
  );

  const winners: Candidate[] = [];
  for (const candidate of ranked) {
    const free = winners.every(
      (w) => w.column !== candidate.column && w.field !== candidate.field,
    );
    if (free) winners.push(candidate);
  }
  return winners;
}

function isContested(win: Candidate, candidates: Candidate[]): boolean {
  return candidates.some(
    (c) =>
      c.field === win.field &&
      c.column !== win.column &&
      c.confidence === win.confidence &&
      c.hasData,
  );
}

function fold(header: string): string {
  return header.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
}

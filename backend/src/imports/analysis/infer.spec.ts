import type { InferenceFallback } from '../../generated/prisma/enums';
import type { ColumnGuesser } from '../../worker/types';
import type { ColumnMapping } from '../types';
import { inferMapping } from './infer';
import { match } from './match';

const FILE = {
  headers: ['email', 'Name'],
  headerRowIndex: 0,
  sampleRows: [
    ['ada@example.com', 'Ada Lovelace'],
    ['alan@example.com', 'Alan Turing'],
  ],
};

function heuristic(fallback: InferenceFallback) {
  return {
    mappings: match(FILE.headers, FILE.sampleRows),
    source: 'HEURISTIC',
    fallback,
  };
}

const GOOD: ColumnMapping[] = [
  { sourceColumn: 'email', targetField: 'email', confidence: 0.95 },
  { sourceColumn: 'Name', targetField: 'name', confidence: 0.8 },
];

describe('inferMapping', () => {
  const signal = new AbortController().signal;

  it("uses the guesser's mapping when it gives one", async () => {
    const guesser: ColumnGuesser = { guess: jest.fn().mockResolvedValue(GOOD) };

    await expect(inferMapping(FILE, guesser, signal)).resolves.toEqual({
      mappings: GOOD,
      source: 'LLM',
      fallback: null,
    });
  });

  it('falls back to the heuristic with NO_KEY when there is no guesser', async () => {
    const guesser: ColumnGuesser = { guess: jest.fn().mockResolvedValue(null) };

    await expect(inferMapping(FILE, guesser, signal)).resolves.toEqual(
      heuristic('NO_KEY'),
    );
  });

  it('falls back to the heuristic with GUESS_FAILED when the guesser throws', async () => {
    const guesser: ColumnGuesser = {
      guess: jest.fn().mockRejectedValue(new Error('network down')),
    };

    await expect(inferMapping(FILE, guesser, signal)).resolves.toEqual(
      heuristic('GUESS_FAILED'),
    );
  });

  // toBe, not toHaveBeenCalledWith: the latter compares by value, and any two
  // fresh AbortSignals look equal. Only identity proves it was passed through.
  it('passes the abort signal to the guesser', async () => {
    const guess = jest
      .fn<
        ReturnType<ColumnGuesser['guess']>,
        Parameters<ColumnGuesser['guess']>
      >()
      .mockResolvedValue(null);

    await inferMapping(FILE, { guess }, signal);

    expect(guess.mock.calls[0][2]).toBe(signal);
  });

  it.each<[string, ColumnMapping[]]>([
    [
      'names a column not in the file',
      [
        { sourceColumn: 'E-mail', targetField: 'email', confidence: 0.9 },
        { sourceColumn: 'Name', targetField: 'name', confidence: 0.8 },
      ],
    ],
    [
      'maps two columns to email',
      [
        { sourceColumn: 'email', targetField: 'email', confidence: 0.9 },
        { sourceColumn: 'Name', targetField: 'email', confidence: 0.8 },
      ],
    ],
    [
      'maps no column to email',
      [{ sourceColumn: 'Name', targetField: 'name', confidence: 0.8 }],
    ],
  ])(
    'falls back to the heuristic with GUESS_REJECTED when the guess %s',
    async (_, bad) => {
      const guesser: ColumnGuesser = {
        guess: jest.fn().mockResolvedValue(bad),
      };

      await expect(inferMapping(FILE, guesser, signal)).resolves.toEqual(
        heuristic('GUESS_REJECTED'),
      );
    },
  );

  it('fills columns the guess left out with __ignore__, in header order', async () => {
    const file = { ...FILE, headers: ['email', 'Name', 'Notes'] };
    const guesser: ColumnGuesser = {
      guess: jest
        .fn()
        .mockResolvedValue([
          { sourceColumn: 'email', targetField: 'email', confidence: 0.95 },
        ]),
    };

    await expect(inferMapping(file, guesser, signal)).resolves.toEqual({
      mappings: [
        { sourceColumn: 'email', targetField: 'email', confidence: 0.95 },
        { sourceColumn: 'Name', targetField: '__ignore__', confidence: 0.9 },
        { sourceColumn: 'Notes', targetField: '__ignore__', confidence: 0.9 },
      ],
      source: 'LLM',
      fallback: null,
    });
  });
});

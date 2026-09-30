import type { ColumnMapping } from '../types';
import { ClaudeColumnGuesser } from './claude-guesser';

// The SDK client, faked: every `new Anthropic()` gets this one parse().
// The `mock` prefix lets jest.mock's hoisted factory reach it.
const mockParse = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn(() => ({ messages: { parse: mockParse } })),
}));

const GOOD: ColumnMapping[] = [
  { sourceColumn: 'email', targetField: 'email', confidence: 0.95 },
  { sourceColumn: 'Name', targetField: 'name', confidence: 0.8 },
];

describe('ClaudeColumnGuesser', () => {
  const signal = new AbortController().signal;
  const guesser = new ClaudeColumnGuesser('sk-ant-test');

  beforeEach(() => {
    mockParse.mockReset();
  });

  // null is reserved for "no guesser configured". A key-holding job that
  // returned it would be stored as NO_KEY.
  it('throws when Claude returns no parsed output', async () => {
    mockParse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: null,
    });

    await expect(guesser.guess(['email', 'Name'], [], signal)).rejects.toThrow(
      'no parsed output',
    );
  });

  it("returns Claude's mappings when it parses", async () => {
    mockParse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { mappings: GOOD },
    });

    await expect(guesser.guess(['email', 'Name'], [], signal)).resolves.toEqual(
      GOOD,
    );
  });
});

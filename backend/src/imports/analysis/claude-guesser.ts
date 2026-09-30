import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import z from 'zod';
import type { ColumnGuesser } from '../../worker/types';
import { TARGET_FIELDS, type ColumnMapping } from '../types';

const CLAUDE_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You map CSV columns to contact fields.
Fields: ${TARGET_FIELDS.toString()}. (Use __ignore__ for anything else).
Each field goes to at most one column. Copy sourceColumn exactly as given.
jobTitle is a role ("Head of Sales"); company is an organisation ("Acme GmbH").
If several columns look like phones, pick the one with the most filled values.
confidence is 0 to 1: how sure you are of that one column.`;

// the shape Claude must reply with
const replySchema = z.object({
  mappings: z.array(
    z.object({
      sourceColumn: z.string(),
      targetField: z.enum(TARGET_FIELDS),
      confidence: z.number(),
    }),
  ),
});

export class ClaudeColumnGuesser implements ColumnGuesser {
  private readonly client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });
  }

  async guess(
    headers: string[],
    sampleRows: string[][],
    signal: AbortSignal,
  ): Promise<ColumnMapping[] | null> {
    const reply = await this.client.messages.parse(
      {
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        output_config: { format: zodOutputFormat(replySchema) },
        messages: [
          { role: 'user', content: JSON.stringify({ headers, sampleRows }) },
        ],
      },
      { signal },
    );

    if (reply.stop_reason !== 'end_turn') {
      throw new Error(`stop_reason ${reply.stop_reason}`);
    }

    return reply.parsed_output?.mappings ?? null;
  }
}

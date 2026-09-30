import { Logger } from '@nestjs/common';
import type {
  InferenceFallback,
  InferenceSource,
} from '../../generated/prisma/enums';
import type { ColumnGuesser } from '../../worker/types';
import type { ColumnMapping } from '../types';
import { match } from './match';
import type { SniffedFile } from './sniff';
import { validateMapping } from './validate';

const logger = new Logger('inferMapping');

/**
 * Asks the guesser for a mapping. On `null`, an invalid mapping, or any error, falls back to the
 * heuristic and says why in `fallback`. Never throws: a failed guess must not fail the import.
 */
export async function inferMapping(
  file: Pick<SniffedFile, 'headers' | 'headerRowIndex' | 'sampleRows'>,
  guesser: ColumnGuesser,
  signal: AbortSignal,
): Promise<{
  mappings: ColumnMapping[];
  source: InferenceSource;
  fallback: InferenceFallback | null;
}> {
  let fallback: InferenceFallback = 'NO_KEY';
  try {
    const guessed = await guesser.guess(file.headers, file.sampleRows, signal);
    if (guessed) {
      const result = validateMapping(file, {
        headerRowIndex: file.headerRowIndex,
        mappings: guessed,
      });
      if (result.ok) {
        const mappings = file.headers.map(
          (header) =>
            result.mapping.mappings.find((m) => m.sourceColumn === header) ?? {
              sourceColumn: header,
              targetField: '__ignore__' as const,
              confidence: 0.9,
            },
        );
        return { mappings, source: 'LLM', fallback: null };
      }
      fallback = 'GUESS_REJECTED';
      logger.warn(
        `Guess rejected: ${result.issues.map((i) => i.message).join('; ')}`,
      );
    }
  } catch (error) {
    fallback = 'GUESS_FAILED';
    logger.warn(
      `Guess failed, fallback to the heuristic: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    mappings: match(file.headers, file.sampleRows),
    source: 'HEURISTIC',
    fallback,
  };
}

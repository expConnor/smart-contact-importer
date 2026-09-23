import z from 'zod';
import type { FieldError } from '../../common/errors/error-catalogue';
import { TARGET_FIELDS, type MappingPayload, type TargetField } from '../types';
import type { SniffedFile } from './sniff';

export type MappingResult =
  { ok: true; mapping: MappingPayload } | { ok: false; issues: FieldError[] };

// Unknown keys are stripped (zod's default), so extras never reach the DB.
const payloadSchema = z.object({
  headerRowIndex: z.number().int().min(0),
  mappings: z.array(
    z.object({
      sourceColumn: z.string(),
      targetField: z.enum(TARGET_FIELDS),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

/**
 * Checks a mapping against the file it claims to describe. Every mapping
 * passes through here: the heuristic's, the model's and the user's.
 *
 * Total: a bad payload comes back as issues rather than a throw. What to do
 * about them is the caller's call.
 */
export function validateMapping(
  file: Pick<SniffedFile, 'headers' | 'headerRowIndex'>,
  payload: unknown,
): MappingResult {
  const parsed = payloadSchema.safeParse(payload);

  // The checks below need a well-formed payload, so zod's issues come alone.
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const mapping = parsed.data;
  const issues: FieldError[] = [];

  if (mapping.headerRowIndex !== file.headerRowIndex) {
    issues.push({
      field: 'headerRowIndex',
      message: `Header row must be ${file.headerRowIndex}, the row analysis detected`,
    });
  }

  // First claimant wins; later ones get the issue. A column left out of the
  // list means `__ignore__`, and `__ignore__` may repeat.
  const seenColumns = new Set<string>();
  const owners = new Map<TargetField, string>();

  for (const [i, { sourceColumn, targetField }] of mapping.mappings.entries()) {
    // Exact match: no case folding, no trim. A repeated header name in the
    // file is fine; it means the leftmost column.
    if (!file.headers.includes(sourceColumn)) {
      issues.push({
        field: `mappings.${i}.sourceColumn`,
        message: `"${sourceColumn}" is not a column in the file`,
      });
    }

    if (seenColumns.has(sourceColumn)) {
      issues.push({
        field: `mappings.${i}.sourceColumn`,
        message: `"${sourceColumn}" is mapped more than once`,
      });
    }
    seenColumns.add(sourceColumn);

    if (targetField === '__ignore__') continue;

    const owner = owners.get(targetField);
    if (owner === undefined) {
      owners.set(targetField, sourceColumn);
    } else {
      issues.push({
        field: `mappings.${i}.targetField`,
        message: `${targetField} is already mapped from "${owner}"`,
      });
    }
  }

  if (!owners.has('email')) {
    issues.push({ field: 'mappings', message: 'No column is mapped to email' });
  }

  return issues.length === 0 ? { ok: true, mapping } : { ok: false, issues };
}

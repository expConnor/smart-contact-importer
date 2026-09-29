import type { ColumnMapping, TargetField } from '../api';
import {
  columnSamples,
  isLowConfidence,
  isManual,
  meterLevel,
  TARGET_OPTIONS,
} from './mapping';

// One column of the file: its samples, the field it imports as, and how sure
// the proposal was. A row the user changed shows "manual" instead of a score.
export function MappingRow({
  row,
  proposal,
  sampleRows,
  column,
  disabled,
  onPick,
}: {
  row: ColumnMapping;
  proposal: ColumnMapping;
  sampleRows: string[][];
  column: number;
  disabled: boolean;
  onPick: (targetField: TargetField) => void;
}) {
  const manual = isManual(row, proposal);
  const low = !manual && isLowConfidence(proposal.confidence);
  const samples = columnSamples(sampleRows, column);

  return (
    <tr data-low={low || undefined}>
      <td>
        <span className="mono">{row.sourceColumn}</span>
      </td>
      <td className="muted">
        <span className="mapping-samples" title={samples.join(', ')}>
          {samples.length > 0 ? samples.slice(0, 3).join(', ') : 'empty'}
        </span>
      </td>
      <td>
        <select
          className="input mono mapping-select"
          aria-label={`Import ${row.sourceColumn} as`}
          value={row.targetField}
          onChange={(event) => onPick(event.target.value as TargetField)}
          disabled={disabled}
        >
          {TARGET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        {manual ? (
          <span className="manual">manual</span>
        ) : (
          <ConfidenceMeter confidence={proposal.confidence} />
        )}
      </td>
    </tr>
  );
}

// Three bars and the score. Colour comes from data-level in CSS.
function ConfidenceMeter({ confidence }: { confidence: number }) {
  return (
    <span className="meter" data-level={meterLevel(confidence)}>
      <span className="meter-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="meter-score">{confidence.toFixed(2)}</span>
    </span>
  );
}

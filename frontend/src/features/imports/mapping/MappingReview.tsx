import { useState } from 'react';
import { errorText } from '@/shared/api/errors';
import { ErrorMessage } from '@/shared/ui/ErrorMessage';
import { Panel } from '@/shared/ui/Panel';
import type { ImportJob, TargetField } from '../api';
import { useConfirmMapping } from '../queries';
import { MappingRow } from './MappingRow';
import {
  mappingProblems,
  serverIssues,
  sourceLabel,
  toPayload,
} from './mapping';
import './mapping.css';

// The system proposes, the user decides: nothing is imported until they
// confirm this table.
export function MappingReview({ job }: { job: ImportJob }) {
  const proposed = job.proposedMapping ?? [];
  const sampleRows = job.sampleRows ?? [];
  const headerRowIndex = job.headerRowIndex ?? 0;

  // Seeded once: polling has stopped in AWAITING_MAPPING, so the proposal
  // can't change underneath the user's edits.
  const [rows, setRows] = useState(() => job.proposedMapping ?? []);
  const confirm = useConfirmMapping(job.id);

  const problems = mappingProblems(rows);
  const issues = confirm.error ? serverIssues(confirm.error) : [];

  // The server alert described the old mapping, so any edit clears it.
  function pick(index: number, targetField: TargetField) {
    setRows(
      rows.map((row, i) => (i === index ? { ...row, targetField } : row)),
    );
    confirm.reset();
  }

  return (
    <Panel
      className="mapping"
      title="Check the column mapping"
      description={
        <span className="mono">
          header line {headerRowIndex + 1} · rows {job.totalRows ?? 0} · source{' '}
          {job.inferenceSource ? sourceLabel(job.inferenceSource) : '—'}
        </span>
      }
    >
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Column in file</th>
              <th>Sample values</th>
              <th>Import as</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <MappingRow
                key={i}
                row={row}
                proposal={proposed[i]}
                sampleRows={sampleRows}
                column={i}
                disabled={confirm.isPending}
                onPick={(targetField) => pick(i, targetField)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {(problems.length > 0 || confirm.error) && (
        <div className="mapping-alerts">
          {problems.length > 0 && (
            <div className="alert" role="alert">
              <p className="alert-title">Fix before importing</p>
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          {issues.length > 0 && (
            <div className="alert" role="alert">
              <p className="alert-title">The server rejected this mapping</p>
              {issues.map((issue) => (
                <p key={issue} className="mono">
                  {issue}
                </p>
              ))}
            </div>
          )}

          {confirm.error && issues.length === 0 && (
            <ErrorMessage>{errorText(confirm.error)}</ErrorMessage>
          )}
        </div>
      )}

      <div className="mapping-footer">
        <p className="muted">
          Rows without a valid email are skipped and counted as failed.
        </p>
        <button
          className="button button-primary"
          type="button"
          onClick={() =>
            confirm.mutate(toPayload(headerRowIndex, rows, proposed))
          }
          disabled={problems.length > 0 || confirm.isPending}
        >
          {confirm.isPending ? 'Importing…' : 'Import contacts'}
        </button>
      </div>
    </Panel>
  );
}

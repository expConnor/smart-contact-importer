import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, confirmMapping, errorText } from './api';
import type { ImportJob, MappingPayload, TargetField } from './api';
import {
  columnSamples,
  isManual,
  mappingProblems,
  meterLevel,
  serverIssues,
  sourceLabel,
  TARGET_OPTIONS,
  toPayload,
} from './mapping';

export function MappingReview({ job }: { job: ImportJob }) {
  const queryClient = useQueryClient();
  const proposed = job.proposedMapping ?? [];
  const sampleRows = job.sampleRows ?? [];
  const headerRowIndex = job.headerRowIndex ?? 0;

  // Seeded once: polling has stopped in AWAITING_MAPPING, so the proposal
  // can't change underneath the user's edits.
  const [rows, setRows] = useState(() => job.proposedMapping ?? []);

  const mutation = useMutation({
    mutationFn: (payload: MappingPayload) => confirmMapping(job.id, payload),
    // The 202 body is the job, now PENDING_IMPORT. Swapping it in restarts
    // polling without another GET.
    onSuccess: (updated) => {
      queryClient.setQueryData(['import', job.id], updated);
    },
    // 409: the job already moved on (confirmed in another tab or by curl).
    // Refetch so the page shows its real status.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['import', job.id] });
      }
    },
  });

  const problems = mappingProblems(rows);
  const issues = mutation.error ? serverIssues(mutation.error) : [];

  // The server alert described the old mapping, so any edit clears it.
  function pick(index: number, targetField: TargetField) {
    setRows(
      rows.map((row, i) => (i === index ? { ...row, targetField } : row)),
    );
    mutation.reset();
  }

  return (
    <div className="panel mapping">
      <div className="panel-head">
        <h2 className="job-heading">Check the column mapping</h2>
        <p className="mono muted mapping-meta">
          header line {headerRowIndex + 1} · rows {job.totalRows ?? 0} · source{' '}
          {job.inferenceSource ? sourceLabel(job.inferenceSource) : '—'}
        </p>
      </div>

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
            {rows.map((row, i) => {
              const proposal = proposed[i];
              const manual = isManual(row, proposal);
              const low = !manual && proposal.confidence < 0.85;
              const samples = columnSamples(sampleRows, i);
              return (
                <tr key={i} data-low={low || undefined}>
                  <td>
                    <span className="mono">{row.sourceColumn}</span>
                  </td>
                  <td className="muted">
                    <span
                      className="mapping-samples"
                      title={samples.join(', ')}
                    >
                      {samples.length > 0
                        ? samples.slice(0, 3).join(', ')
                        : 'empty'}
                    </span>
                  </td>
                  <td>
                    <select
                      className="input mono mapping-select"
                      aria-label={`Import ${row.sourceColumn} as`}
                      value={row.targetField}
                      onChange={(event) =>
                        pick(i, event.target.value as TargetField)
                      }
                      disabled={mutation.isPending}
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
                      <span
                        className="meter"
                        data-level={meterLevel(proposal.confidence)}
                      >
                        <span className="meter-bars" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                        <span className="meter-score">
                          {proposal.confidence.toFixed(2)}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(problems.length > 0 || mutation.error) && (
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

          {mutation.error && issues.length === 0 && (
            <p className="error" role="alert">
              ✕ {errorText(mutation.error)}
            </p>
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
            mutation.mutate(toPayload(headerRowIndex, rows, proposed))
          }
          disabled={problems.length > 0 || mutation.isPending}
        >
          {mutation.isPending ? 'Importing…' : 'Import contacts'}
        </button>
      </div>
    </div>
  );
}

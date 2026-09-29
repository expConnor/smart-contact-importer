import { useMutation } from '@tanstack/react-query';
import { Panel } from '@/shared/ui/Panel';
import { confirmMapping, createImport } from '../api';
import type { ImportJob } from '../api';
import { POLL_INTERVAL_MS } from '../queries';
import { isPolling } from '../status';
import { badMapping } from './requestLog';
import { uploadOf, useRequestLog } from './store';
import type { Upload } from './store';
import './request-log.css';

// The job's calls as this tab made them, plus three buttons that make the
// backend prove its guarantees. The buttons call the API directly, with no
// cache updates: the answer shows only as a row, and none of them changes
// the job.
export function RequestLogPanel({ job }: { job: ImportJob }) {
  const rows = useRequestLog(job.id);
  const upload = uploadOf(job.id);
  // A mapping exists once analysis settled; any status past review answers
  // a second confirm with 409.
  const canConfirmAgain =
    job.proposedMapping !== null && job.status !== 'AWAITING_MAPPING';

  // Same key and file: 200 with the same id, no second job or analysis.
  const replay = useMutation({
    mutationFn: ({ file, key }: Upload) => createImport(file, key),
  });
  // A column the file doesn't have: 422 MAPPING_INVALID.
  const bad = useMutation({
    mutationFn: () => confirmMapping(job.id, badMapping(job)),
  });
  // The server checks the status first, so any payload gets 409.
  const again = useMutation({
    mutationFn: () =>
      confirmMapping(job.id, {
        headerRowIndex: job.headerRowIndex ?? 0,
        mappings: job.proposedMapping ?? [],
      }),
  });

  return (
    <Panel
      className="log"
      title="Request log"
      aside={
        <span className="mono muted log-polling">
          {isPolling(job.status) ? (
            <>
              <span className="log-dot">●</span> polling {POLL_INTERVAL_MS} ms
            </>
          ) : (
            'polling stopped'
          )}
        </span>
      }
      description="In this tab's memory: a refresh clears it."
    >
      <div className="log-scroll">
        <ol className="log-rows">
          {rows.map((row, i) => (
            <li key={i} className="log-row">
              <div className="log-line">
                <span className="mono log-route">
                  {row.method} {row.route}
                  {row.count > 1 && (
                    <span className="muted"> ×{row.count}</span>
                  )}
                </span>
                <span className="mono log-code" data-code={row.code}>
                  {row.code}
                </span>
              </div>
              {row.note && <p className="muted log-note">{row.note}</p>}
            </li>
          ))}
        </ol>
      </div>

      <div className="log-actions">
        {upload && (
          <button
            className="button"
            type="button"
            title="Resends the same Idempotency-Key and file. Expect 200 with the same job id: no new job, no second analysis."
            onClick={() => replay.mutate(upload)}
            disabled={replay.isPending}
          >
            Replay upload
          </button>
        )}
        {job.status === 'AWAITING_MAPPING' && (
          <button
            className="button"
            type="button"
            title="Sends a mapping that names a column the file does not have. Expect 422 MAPPING_INVALID; the job stays AWAITING_MAPPING."
            onClick={() => bad.mutate()}
            disabled={bad.isPending}
          >
            Send bad mapping
          </button>
        )}
        {canConfirmAgain && (
          <button
            className="button"
            type="button"
            title="Sends the confirm again. Expect 409: the job is no longer AWAITING_MAPPING."
            onClick={() => again.mutate()}
            disabled={again.isPending}
          >
            Confirm again
          </button>
        )}
      </div>
    </Panel>
  );
}

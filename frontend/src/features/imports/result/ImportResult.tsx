import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Panel } from '@/shared/ui/Panel';
import type { ImportJob, ImportRowError } from '../api';
import { PathTaken } from './PathTaken';
import {
  cappedNote,
  delimiterLabel,
  formatBytes,
  rawRowText,
  skippedLine,
} from './result';
import './result.css';

// The analysis wrote the path and run facts, so they show from the start.
// The counts are written when the job settles. Until then the API sends 0,
// which would read as "nothing imported", so those tiles shimmer instead.
export function ImportResult({ job }: { job: ImportJob }) {
  const done = job.status === 'COMPLETED';
  // The file's column order: the mapping lists every column, left to right.
  const columns = job.proposedMapping?.map((m) => m.sourceColumn);

  return (
    <Panel
      className="result"
      title={done ? 'Import finished' : 'Importing'}
      description={
        done ? (
          <span className="mono">
            mapping source: {job.inferenceSource ?? '—'}
          </span>
        ) : (
          'Counts arrive when the job settles.'
        )
      }
    >
      <div className="panel-body">
        <div className="tiles">
          <CountTile label="Rows" count={job.totalRows ?? undefined} />
          <CountTile
            label="Imported"
            count={job.importedRows}
            pending={!done}
            tone="good"
          />
          <CountTile
            label="Failed"
            count={job.failedRows}
            pending={!done}
            tone="bad"
          />
        </div>

        <div className="result-details">
          <PathTaken
            source={job.inferenceSource}
            fallback={job.inferenceFallback}
          />
          <RunFacts job={job} />
        </div>

        {done && job.errors.length > 0 && (
          <FailedRows
            errors={job.errors}
            failedRows={job.failedRows}
            columns={columns}
          />
        )}

        {done ? (
          <div className="result-footer">
            <p className="muted">{skippedLine(job.failedRows)}</p>
            <Link to="/contacts" className="button button-primary">
              View contacts
            </Link>
          </div>
        ) : (
          <div className="result-footer" aria-hidden>
            <span className="skeleton result-line-skeleton" />
            <span className="skeleton result-button-skeleton" />
          </div>
        )}
      </div>
    </Panel>
  );
}

// Colour only a count worth noticing: a green 0 is noise.
// Pending: the count isn't written yet, so a shimmering bar holds its place.
function CountTile({
  label,
  count,
  pending = false,
  tone,
}: {
  label: string;
  count: number | undefined;
  pending?: boolean;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="tile" data-tone={!pending && count ? tone : undefined}>
      <p className="label">{label}</p>
      <p className="tile-count">
        {pending ? (
          <>
            <span className="skeleton tile-skeleton" aria-hidden />
            <span className="visually-hidden">pending</span>
          </>
        ) : (
          <span className="tile-value">{count ?? '—'}</span>
        )}
      </p>
    </div>
  );
}

// How the worker ran this job, as a spec sheet: label left, value right,
// with a dim note where the raw number differs from the friendly one.
function RunFacts({ job }: { job: ImportJob }) {
  const running = job.status === 'IMPORTING';
  const facts: { label: string; value: ReactNode; note?: string }[] = [
    {
      label: 'Import attempts',
      value: (
        <>
          <span className="pips" aria-hidden>
            {Array.from({ length: job.maxAttempts }, (_, i) => (
              <span
                key={i}
                className="pip"
                data-used={i < job.attempts}
                // The claim bumps attempts, so the last used pip is the run
                // a worker holds right now.
                data-running={running && i === job.attempts - 1}
              />
            ))}
          </span>
          {job.attempts} of {job.maxAttempts}
        </>
      ),
    },
    {
      label: 'File size',
      value: formatBytes(job.byteSize),
      note:
        job.byteSize >= 1024
          ? `${job.byteSize.toLocaleString('en')} B`
          : undefined,
    },
    { label: 'Encoding', value: job.detectedEncoding ?? '—' },
    { label: 'Delimiter', value: delimiterLabel(job.detectedDelimiter) },
    // The spreadsheet row, counting from 1; the note is the 0-based index.
    {
      label: 'Header row',
      value: job.headerRowIndex === null ? '—' : job.headerRowIndex + 1,
      note:
        job.headerRowIndex === null ? undefined : `index ${job.headerRowIndex}`,
    },
  ];

  return (
    <section className="result-card">
      <header className="result-card-head">
        <h3 className="label">Run facts</h3>
      </header>
      <dl className="facts-list">
        {facts.map(({ label, value, note }) => (
          <div key={label} className="fact">
            <dt className="muted">{label}</dt>
            <dd className="fact-value mono">
              {value}
              {note && <span className="dim">{note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FailedRows({
  errors,
  failedRows,
  columns,
}: {
  errors: ImportRowError[];
  failedRows: number;
  columns: string[] | undefined;
}) {
  const note = cappedNote(errors.length, failedRows);

  return (
    <div className="result-errors">
      <h3 className="heading">Failed rows</h3>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Reason</th>
              <th>Raw row</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error) => {
              const raw = rawRowText(error.rawRow, columns);
              return (
                <tr key={error.rowNumber}>
                  <td>
                    <span className="mono">{error.rowNumber}</span>
                  </td>
                  <td>{error.message}</td>
                  <td className="muted">
                    <span className="mono result-raw" title={raw}>
                      {raw}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {note && <p className="muted result-note">{note}</p>}
    </div>
  );
}

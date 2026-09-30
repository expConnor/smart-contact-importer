import { Link } from 'react-router';
import { Panel } from '@/shared/ui/Panel';
import type { ImportJob, ImportRowError } from '../api';
import { cappedNote, rawRowText, skippedLine } from './result';
import './result.css';

// The counts are written when the job settles. Until then the API sends 0,
// which would read as "nothing imported", so the tiles show — instead.
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
            mapping source {job.inferenceSource ?? '—'}
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
            count={done ? job.importedRows : undefined}
            tone="good"
          />
          <CountTile
            label="Failed"
            count={done ? job.failedRows : undefined}
            tone="bad"
          />
        </div>

        {done && job.errors.length > 0 && (
          <FailedRows
            errors={job.errors}
            failedRows={job.failedRows}
            columns={columns}
          />
        )}

        {done && (
          <div className="result-footer">
            <p className="muted">{skippedLine(job.failedRows)}</p>
            <Link to="/contacts" className="button button-primary">
              View contacts
            </Link>
          </div>
        )}
      </div>
    </Panel>
  );
}

// Colour only a count worth noticing: a green 0 is noise.
function CountTile({
  label,
  count,
  tone,
}: {
  label: string;
  count: number | undefined;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="tile" data-tone={count ? tone : undefined}>
      <p className="label">{label}</p>
      <p className="tile-count">{count ?? '—'}</p>
    </div>
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

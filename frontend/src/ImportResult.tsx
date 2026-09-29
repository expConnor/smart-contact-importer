import { Link } from 'react-router';
import type { ImportJob } from './api';
import { cappedNote, rawRowText, skippedLine } from './result';

// The counts are written when the job settles. Until then the API sends 0,
// which would read as "nothing imported", so the tiles show — instead.
export function ImportResult({ job }: { job: ImportJob }) {
  const done = job.status === 'COMPLETED';
  const note = cappedNote(job.errors.length, job.failedRows);
  // The file's column order: the mapping lists every column, left to right.
  const columns = job.proposedMapping?.map((m) => m.sourceColumn);

  return (
    <div className="panel job-panel result">
      {done ? (
        <h2 className="job-heading">Import finished</h2>
      ) : (
        <>
          <h2 className="job-heading">Importing</h2>
          <p className="muted">Counts arrive when the job settles.</p>
        </>
      )}

      <div className="tiles">
        <div className="tile">
          <p className="label">Rows</p>
          <p className="tile-count">{job.totalRows ?? '—'}</p>
        </div>
        <div
          className="tile"
          data-tone={done && job.importedRows > 0 ? 'good' : undefined}
        >
          <p className="label">Imported</p>
          <p className="tile-count">{done ? job.importedRows : '—'}</p>
        </div>
        <div
          className="tile"
          data-tone={done && job.failedRows > 0 ? 'bad' : undefined}
        >
          <p className="label">Failed</p>
          <p className="tile-count">{done ? job.failedRows : '—'}</p>
        </div>
      </div>

      {done && job.errors.length > 0 && (
        <div className="result-errors">
          <h3 className="job-heading">Failed rows</h3>
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
                {job.errors.map((error) => {
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
  );
}

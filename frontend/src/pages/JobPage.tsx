import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { errorText, getImport } from '../api';
import { isPolling, shortId, STATUS_LINE } from '../job';
import { MappingReview } from '../MappingReview';

export function JobPage() {
  const { id = '' } = useParams();

  // 250 ms: analysis takes milliseconds, so a slower poll would skip states.
  // Stops once no worker has anything left to do.
  const job = useQuery({
    queryKey: ['import', id],
    queryFn: () => getImport(id),
    refetchInterval: (query) =>
      isPolling(query.state.data?.status) ? 250 : false,
  });

  // The sidebar list only polls while a job it already knows is moving. A
  // change it can't see (a job uploaded or confirmed with curl, or in another
  // tab) would leave its badge stale, so each new status here refetches it.
  const queryClient = useQueryClient();
  const seenStatus = job.data?.status;
  useEffect(() => {
    if (seenStatus) {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    }
  }, [id, seenStatus, queryClient]);

  // Bad id (400) or unknown / someone else's job (404). A 401 goes to /login.
  if (job.error && !job.data) {
    return (
      <div className="panel job-panel">
        <p className="error" role="alert">
          ✕ {errorText(job.error)}
        </p>
      </div>
    );
  }

  // No spinner: on localhost it would only flash.
  if (!job.data) return null;

  const { status } = job.data;
  const analysing = status === 'PENDING_ANALYSIS' || status === 'ANALYZING';

  return (
    <div className="job">
      <div className="panel job-panel">
        <div className="job-head">
          <h1 className="mono job-title">Import {shortId(id)}</h1>
          <span className="tag" data-status={status}>
            {status}
          </span>
        </div>
        <p className="muted">{STATUS_LINE[status]}</p>
        {/* The last good status stays; polling keeps trying underneath. */}
        {job.error && (
          <p className="error" role="alert">
            ✕ Polling failed: {errorText(job.error)}
          </p>
        )}
      </div>

      {analysing && (
        <div className="panel job-panel">
          <h2 className="job-heading">Analysing</h2>
          <p className="muted">
            The worker decodes the file, finds the delimiter and header row, and
            proposes a mapping. The review appears here when the job reaches{' '}
            <span className="mono">AWAITING_MAPPING</span>.
          </p>
        </div>
      )}

      {/* key: switching jobs from the sidebar starts with fresh edits. */}
      {status === 'AWAITING_MAPPING' && (
        <MappingReview key={id} job={job.data} />
      )}
    </div>
  );
}

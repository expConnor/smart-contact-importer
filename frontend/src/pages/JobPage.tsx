import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { errorText, getImport } from '../api';
import { isPolling, shortId, STATUS_LINE } from '../job';
import { ImportResult } from '../ImportResult';
import { JobTimeline } from '../JobTimeline';
import { MappingReview } from '../MappingReview';
import { RequestLogPanel } from '../RequestLogPanel';

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
  const importing = status === 'PENDING_IMPORT' || status === 'IMPORTING';

  return (
    <div className="job">
      <div className="panel job-panel job-top">
        <div className="job-head">
          <h1 className="mono job-title">Import {shortId(id)}</h1>
          <span className="tag" data-status={status}>
            {status}
          </span>
        </div>
        <JobTimeline job={job.data} />
        {/* Shimmers while a worker still has work: the page isn't idle. */}
        <p className={isPolling(status) ? 'muted shimmer' : 'muted'}>
          {STATUS_LINE[status]}
        </p>
        {/* The last good status stays; polling keeps trying underneath. */}
        {job.error && (
          <p className="error" role="alert">
            ✕ Polling failed: {errorText(job.error)}
          </p>
        )}
      </div>

      <div className="job-content">
        {analysing && (
          <div className="panel">
            <div className="panel-head">
              <h2 className="job-heading">Analysing</h2>
            </div>
            <p className="muted panel-body">
              The worker decodes the file, finds the delimiter and header row,
              and proposes a mapping. The review appears here when the job
              reaches <span className="mono">AWAITING_MAPPING</span>.
            </p>
          </div>
        )}

        {/* key: switching jobs from the sidebar starts with fresh edits. */}
        {status === 'AWAITING_MAPPING' && (
          <MappingReview key={id} job={job.data} />
        )}

        {(importing || status === 'COMPLETED') && (
          <ImportResult job={job.data} />
        )}

        {status === 'FAILED' && (
          <div className="panel">
            <div className="panel-head">
              <h2 className="job-heading">This file couldn't be imported</h2>
            </div>
            <div className="panel-body">
              <div className="alert" role="alert">
                {/* The type allows null, though every failure path writes one. */}
                <p className="mono">
                  {job.data.failureReason ?? 'No reason recorded.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* key: a click still pending on another job doesn't disable these. */}
      <RequestLogPanel key={id} job={job.data} />
    </div>
  );
}

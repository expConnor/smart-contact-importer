import { useParams } from 'react-router';
import { errorText } from '@/shared/api/errors';
import { ErrorMessage } from '@/shared/ui/ErrorMessage';
import { Panel } from '@/shared/ui/Panel';
import type { ImportJob } from './api';
import { MappingReview } from './mapping/MappingReview';
import { useImportJob } from './queries';
import { RequestLogPanel } from './request-log/RequestLogPanel';
import { ImportResult } from './result/ImportResult';
import {
  isAnalysing,
  isImporting,
  isPolling,
  shortId,
  STATUS_LINE,
} from './status';
import { JobTimeline } from './timeline/JobTimeline';
import './job.css';

export function JobPage() {
  const { id = '' } = useParams();
  const job = useImportJob(id);

  // Bad id (400) or unknown / someone else's job (404). A 401 goes to /login.
  if (job.error && !job.data) {
    return (
      <div className="panel job-panel">
        <ErrorMessage>{errorText(job.error)}</ErrorMessage>
      </div>
    );
  }

  // No spinner: on localhost it would only flash.
  if (!job.data) return null;

  const { status } = job.data;

  return (
    <div className="job">
      <JobSummary job={job.data} pollError={job.error} />

      <div className="job-content">
        {isAnalysing(status) && <AnalysingPanel />}
        {/* key: switching jobs from the sidebar starts with fresh edits. */}
        {status === 'AWAITING_MAPPING' && (
          <MappingReview key={id} job={job.data} />
        )}
        {(isImporting(status) || status === 'COMPLETED') && (
          <ImportResult job={job.data} />
        )}
        {status === 'FAILED' && <FailedPanel reason={job.data.failureReason} />}
      </div>

      {/* key: a click still pending on another job doesn't disable these. */}
      <RequestLogPanel key={id} job={job.data} />
    </div>
  );
}

// Title, status tag, timeline and one line on what happens next.
function JobSummary({
  job,
  pollError,
}: {
  job: ImportJob;
  pollError: Error | null;
}) {
  return (
    <div className="panel job-panel job-top">
      <div className="job-head">
        <h1 className="mono job-title">Import {shortId(job.id)}</h1>
        <span className="tag" data-status={job.status}>
          {job.status}
        </span>
      </div>
      <JobTimeline job={job} />
      {/* Shimmers while a worker still has work: the page isn't idle. */}
      <p className={isPolling(job.status) ? 'muted shimmer' : 'muted'}>
        {STATUS_LINE[job.status]}
      </p>
      {/* The last good status stays; polling keeps trying underneath. */}
      {pollError && (
        <ErrorMessage>Polling failed: {errorText(pollError)}</ErrorMessage>
      )}
    </div>
  );
}

function AnalysingPanel() {
  return (
    <Panel title="Analysing">
      <p className="muted panel-body">
        The worker decodes the file, finds the delimiter and header row, and
        proposes a mapping. The review appears here when the job reaches{' '}
        <span className="mono">AWAITING_MAPPING</span>.
      </p>
    </Panel>
  );
}

function FailedPanel({ reason }: { reason: string | null }) {
  return (
    <Panel title="This file couldn't be imported">
      <div className="panel-body">
        <div className="alert" role="alert">
          {/* The type allows null, though every failure path writes one. */}
          <p className="mono">{reason ?? 'No reason recorded.'}</p>
        </div>
      </div>
    </Panel>
  );
}

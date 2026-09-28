import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router';
import { errorText, listImports } from './api';
import { anyPolling, shortId, statusLabel } from './job';

export function Sidebar() {
  // Same 250 ms as the job page, so both show the same states. An idle list
  // stops; an upload or a status seen on the job page refetches it.
  const imports = useQuery({
    queryKey: ['imports'],
    queryFn: listImports,
    refetchInterval: (query) =>
      anyPolling(query.state.data?.items) ? 250 : false,
  });

  return (
    <nav className="sidebar" aria-label="Pages">
      <NavLink className="sidebar-link" to="/contacts">
        Contacts
      </NavLink>

      <h2 className="label sidebar-heading">Imports</h2>

      {/* Only the job list scrolls; Contacts and the heading stay put. */}
      <div className="sidebar-jobs">
        {/* With data, a failed poll keeps the list: the job page reports it. */}
        {imports.error && !imports.data && (
          <p className="error sidebar-note" role="alert">
            ✕ {errorText(imports.error)}
          </p>
        )}

        {imports.data?.items.length === 0 && (
          <p className="muted sidebar-note">No imports yet.</p>
        )}

        {imports.data?.items.map((job) => (
          <NavLink
            key={job.id}
            className="sidebar-link sidebar-job"
            to={`/imports/${job.id}`}
          >
            {/* Only the dot shows; the label is for hover and screen readers. */}
            <span
              className="status"
              data-status={job.status}
              title={statusLabel(job.status)}
            >
              <span className="visually-hidden">{statusLabel(job.status)}</span>
            </span>
            <span className="sidebar-file" title={job.originalFilename}>
              {job.originalFilename}
            </span>
            <span className="mono sidebar-id">{shortId(job.id)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

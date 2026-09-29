import { NavLink } from 'react-router';
import { useImportList } from '@/features/imports/queries';
import { shortId, statusLabel } from '@/features/imports/status';
import { errorText } from '@/shared/api/errors';
import { ErrorMessage } from '@/shared/ui/ErrorMessage';

export function Sidebar() {
  const imports = useImportList();

  return (
    <nav className="sidebar" aria-label="Pages">
      <NavLink className="sidebar-link sidebar-icon-link" to="/contacts">
        <PeopleIcon />
        Contacts
      </NavLink>

      <h2 className="label sidebar-heading">Imports</h2>

      {/* Only the job list scrolls; Contacts and the heading stay put. */}
      <div className="sidebar-jobs">
        {/* With data, a failed poll keeps the list: the job page reports it. */}
        {imports.error && !imports.data && (
          <ErrorMessage className="sidebar-note">
            {errorText(imports.error)}
          </ErrorMessage>
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

// Two people: inline, so no icon library for one glyph.
function PeopleIcon() {
  return (
    <svg
      className="sidebar-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

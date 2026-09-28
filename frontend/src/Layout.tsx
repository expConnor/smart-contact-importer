import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { logout } from './api';
import type { User } from './api';
import { crumbs } from './crumbs';
import { endSession } from './session';
import { Sidebar } from './Sidebar';
import { UploadDialog } from './UploadDialog';

export function Layout({ user }: { user: User }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      endSession(queryClient);
      navigate('/login', { replace: true });
    },
  });

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <nav className="crumbs">
            {crumbs(pathname).map((crumb, i) => (
              <span key={i}>
                {i > 0 && <span className="crumb-sep">/</span>}
                {i === 0 && pathname !== '/contacts' ? (
                  <Link to="/contacts">{crumb}</Link>
                ) : (
                  crumb
                )}
              </span>
            ))}
          </nav>
          <div className="header-actions">
            <span className="mono">{user.email}</span>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Log out
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => setUploadOpen(true)}
            >
              Import CSV
            </button>
          </div>
        </div>
      </header>
      <div className="shell">
        <Sidebar />
        <main className="page">
          <Outlet />
        </main>
      </div>
      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} />}
    </div>
  );
}

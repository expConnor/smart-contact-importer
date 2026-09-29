import type { User } from '@/features/auth/api';
import { useLogout } from '@/features/auth/session';
import { Breadcrumbs } from './Breadcrumbs';

export function Header({
  user,
  onImport,
}: {
  user: User;
  onImport: () => void;
}) {
  const logout = useLogout();

  return (
    <header className="header">
      <div className="header-inner">
        <Breadcrumbs />
        <div className="header-actions">
          <span className="mono">{user.email}</span>
          <button
            className="button button-ghost"
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Log out
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={onImport}
          >
            Import CSV
          </button>
        </div>
      </div>
    </header>
  );
}

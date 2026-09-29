import { Link, useLocation } from 'react-router';
import { crumbs } from './crumbs';

// The first crumb links home unless home is where you are.
export function Breadcrumbs() {
  const { pathname } = useLocation();

  return (
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
  );
}

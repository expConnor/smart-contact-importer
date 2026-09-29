import { Navigate, Route, Routes } from 'react-router';
import { LoginPage } from '@/features/auth/LoginPage';
import { useSession } from '@/features/auth/session';
import { ContactsPage } from '@/features/contacts/ContactsPage';
import { JobPage } from '@/features/imports/JobPage';
import { AppLayout } from './layout/AppLayout';

// Route guard: nothing renders until /me answers (ms on localhost, so no
// spinner). Then a user gets the app and nobody gets /login.
export function App() {
  const session = useSession();

  if (session.isPending) return null;
  const user = session.data ?? null;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/contacts" replace /> : <LoginPage />}
      />
      <Route
        element={
          user ? <AppLayout user={user} /> : <Navigate to="/login" replace />
        }
      >
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/imports/:id" element={<JobPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/contacts" replace />} />
    </Routes>
  );
}

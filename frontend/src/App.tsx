import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { ContactsPage } from './pages/ContactsPage';
import { JobPage } from './pages/JobPage';
import { LoginPage } from './pages/LoginPage';
import { useMe } from './session';

export default function App() {
  const me = useMe();

  if (me.isPending) return null;
  const user = me.data ?? null;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/contacts" replace /> : <LoginPage />}
      />
      <Route
        element={
          user ? <Layout user={user} /> : <Navigate to="/login" replace />
        }
      >
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/imports/:id" element={<JobPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/contacts" replace />} />
    </Routes>
  );
}

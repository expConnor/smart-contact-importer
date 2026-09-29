import { useState } from 'react';
import { Outlet } from 'react-router';
import type { User } from '@/features/auth/api';
import { UploadDialog } from '@/features/imports/upload/UploadDialog';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import './layout.css';

// Every logged-in page: header on top, sidebar left, the page right.
export function AppLayout({ user }: { user: User }) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="app">
      <Header user={user} onImport={() => setUploadOpen(true)} />
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

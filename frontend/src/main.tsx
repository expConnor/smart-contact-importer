import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
// Before any component: feature styles build on these and must load after.
import './shared/styles/index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app/App';
import { queryClient } from './app/queryClient';
import { recordCall } from './features/imports/request-log/store';
import { onResponse } from './shared/api/client';

onResponse(recordCall);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

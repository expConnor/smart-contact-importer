import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ApiError, onResponse } from './api';
import App from './App';
import { recordCall } from './requestLog';

onResponse(recordCall);

// Any 401 means the cookie expired or was deleted. Forget the user and the
// guard in App sends them to /login.
function on401(error: Error) {
  if (error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(['me'], null);
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: on401 }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _result, mutation) => {
      // On the login form a 401 means "wrong password", not "logged out".
      if (mutation.options.mutationKey?.[0] !== 'login') on401(error);
    },
  }),
  // Retries would delay the 401 redirect by seconds and hide failed calls.
  defaultOptions: { queries: { retry: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

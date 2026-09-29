import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { forgetUser, loginMutationKey } from '@/features/auth/session';
import { ApiError } from '@/shared/api/client';

// Any 401 means the cookie expired or was deleted. Forget the user and the
// route guard in App sends them to /login.
function on401(error: Error) {
  if (error instanceof ApiError && error.status === 401) {
    forgetUser(queryClient);
  }
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: on401 }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _result, mutation) => {
      // On the login form a 401 means "wrong password", not "logged out".
      if (mutation.options.mutationKey?.[0] !== loginMutationKey[0]) {
        on401(error);
      }
    },
  }),
  // Retries would delay the 401 redirect by seconds and hide failed calls.
  defaultOptions: { queries: { retry: false } },
});

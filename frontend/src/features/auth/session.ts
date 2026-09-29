import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { getMe, login, logout } from './api';

const sessionKey = ['me'] as const;

// The global 401 handler skips this key: on the login form 401 means "wrong
// password", not "logged out".
export const loginMutationKey = ['login'] as const;

// The logged-in user, or null. The route guard in App reads this.
export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: getMe });
}

// setQueryData, not removeQueries: null tells App the user is gone, while a
// removed query would leave App rendering the logged-in pages.
export function forgetUser(queryClient: QueryClient): void {
  queryClient.setQueryData(sessionKey, null);
}

// Forget the user and drop every cached response, so the next user never
// sees the last one's data.
export function endSession(queryClient: QueryClient): void {
  forgetUser(queryClient);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionKey[0],
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationKey: loginMutationKey,
    mutationFn: login,
    // The response is the user: no second call to /me.
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKey, user);
      navigate('/contacts', { replace: true });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      endSession(queryClient);
      navigate('/login', { replace: true });
    },
  });
}

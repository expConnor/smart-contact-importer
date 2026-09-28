import { useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { getMe } from './api';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: getMe });
}

export function endSession(queryClient: QueryClient) {
  // clear() would delete the user without telling App; null notifies it.
  queryClient.setQueryData(['me'], null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== 'me',
  });
}

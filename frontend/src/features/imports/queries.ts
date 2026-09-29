import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '@/shared/api/client';
import { confirmMapping, createImport, getImport, listImports } from './api';
import type { MappingPayload } from './api';
import { anyPolling, isPolling } from './status';

// Analysis takes milliseconds, so a slower poll would skip states. The list
// and the job page share it, so both show the same states.
export const POLL_INTERVAL_MS = 250;

export const importKeys = {
  all: ['imports'] as const,
  list: () => [...importKeys.all, 'list'] as const,
  detail: (id: string) => [...importKeys.all, 'detail', id] as const,
};

// Polls while a job in it is still moving; an idle list stops. Uploads and
// statuses seen on the job page refetch it.
export function useImportList() {
  return useQuery({
    queryKey: importKeys.list(),
    queryFn: listImports,
    refetchInterval: (query) =>
      anyPolling(query.state.data?.items) ? POLL_INTERVAL_MS : false,
  });
}

// Polls until no worker has anything left to do.
export function useImportJob(id: string) {
  const queryClient = useQueryClient();
  const job = useQuery({
    queryKey: importKeys.detail(id),
    queryFn: () => getImport(id),
    refetchInterval: (query) =>
      isPolling(query.state.data?.status) ? POLL_INTERVAL_MS : false,
  });

  // The list only polls while a job it already knows is moving. A change it
  // can't see (a job uploaded or confirmed with curl, or in another tab)
  // would leave its badge stale, so each new status here refetches it.
  const status = job.data?.status;
  useEffect(() => {
    if (status) {
      void queryClient.invalidateQueries({ queryKey: importKeys.list() });
    }
  }, [id, status, queryClient]);

  return job;
}

export function useCreateImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, key }: { file: File; key: string }) =>
      createImport(file, key),
    // An idle list does not poll, so it would never see the new job.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importKeys.list() });
    },
  });
}

export function useConfirmMapping(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MappingPayload) => confirmMapping(id, payload),
    // The 202 body is the job, now PENDING_IMPORT. Swapping it in restarts
    // polling without another GET.
    onSuccess: (job) => {
      queryClient.setQueryData(importKeys.detail(id), job);
    },
    // 409: the job already moved on (confirmed in another tab or by curl).
    // Refetch so the page shows its real status.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: importKeys.detail(id) });
      }
    },
  });
}

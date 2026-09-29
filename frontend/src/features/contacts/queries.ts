import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { listContacts } from './api';
import type { ContactPage, ContactParams } from './api';

export const contactKeys = {
  all: ['contacts'] as const,
  list: (params: ContactParams) => [...contactKeys.all, params] as const,
};

// Module level, so the query only reruns it when the pages change.
function flatten(data: InfiniteData<ContactPage>) {
  return {
    contacts: data.pages.flatMap((page) => page.items),
    pageCount: data.pages.length,
  };
}

// The server filters, sorts and pages; the table only shows what comes back.
// A new key (any control changed) starts paging over from page one.
export function useContacts(params: ContactParams) {
  return useInfiniteQuery({
    queryKey: contactKeys.list(params),
    queryFn: ({ pageParam }) => listContacts(params, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    select: flatten,
    // Keep the old rows on screen (dimmed) while the new ones load.
    placeholderData: keepPreviousData,
  });
}

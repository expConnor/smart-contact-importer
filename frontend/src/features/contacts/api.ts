import { request } from '@/shared/api/client';

export type Contact = {
  id: string;
  email: string;
  name: string;
  company: string;
  jobTitle: string;
  phone: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactPage = { items: Contact[]; nextCursor: string | null };

export type ContactSort =
  'name' | '-name' | 'company' | '-company' | 'createdAt' | '-createdAt';

export type ContactParams = {
  status: string;
  company: string;
  sort: ContactSort;
  limit: number;
};

// Empty filters are left out: the API rejects `status=`.
export function contactsPath(params: ContactParams, cursor?: string): string {
  const query = new URLSearchParams({
    sort: params.sort,
    limit: String(params.limit),
  });
  const status = params.status.trim();
  const company = params.company.trim();
  if (status !== '') query.set('status', status);
  if (company !== '') query.set('company', company);
  if (cursor !== undefined) query.set('cursor', cursor);
  return `/contacts?${query}`;
}

export function listContacts(
  params: ContactParams,
  cursor: string | null,
): Promise<ContactPage> {
  return request<ContactPage>('GET', contactsPath(params, cursor ?? undefined));
}

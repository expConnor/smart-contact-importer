import { shortId } from './job';

export function crumbs(pathname: string): string[] {
  const job = /^\/imports\/([^/]+)$/.exec(pathname);
  if (job) return ['contacts', 'imports', shortId(job[1])];

  // Every other path redirects to /contacts.
  return ['contacts'];
}

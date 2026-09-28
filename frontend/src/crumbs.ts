export function crumbs(pathname: string): string[] {
  const job = /^\/imports\/([^/]+)$/.exec(pathname);
  if (job) return ['contacts', 'imports', job[1].slice(0, 8)];

  // Every other path redirects to /contacts.
  return ['contacts'];
}

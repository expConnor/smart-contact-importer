import { describe, expect, it } from 'vitest';
import { crumbs } from './crumbs';

describe('crumbs', () => {
  it('shows only contacts on the contacts page', () => {
    expect(crumbs('/contacts')).toEqual(['contacts']);
  });

  it('shows the short job id', () => {
    expect(crumbs('/imports/0199f1c2-aaaa-7bbb-8ccc-0123456789ab')).toEqual([
      'contacts',
      'imports',
      '456789ab',
    ]);
  });

  // Unknown paths redirect to /contacts, so the breadcrumb agrees.
  it.each(['/', '/nope', '/imports'])(
    'falls back to contacts for %s',
    (path) => {
      expect(crumbs(path)).toEqual(['contacts']);
    },
  );
});

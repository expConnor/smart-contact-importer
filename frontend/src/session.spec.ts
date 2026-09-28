import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { endSession } from './session';

describe('endSession', () => {
  // App reads the user through an observer like this one. If the observer
  // never hears the user is gone, App keeps rendering the logged-in pages.
  it('tells whoever watches the session that nobody is logged in', () => {
    const client = new QueryClient();
    client.setQueryData(['me'], { id: 'u1', email: 'user@test.com' });
    const observer = new QueryObserver(client, {
      queryKey: ['me'],
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});

    endSession(client);

    expect(observer.getCurrentResult().data).toBeNull();
    unsubscribe();
  });

  it('drops every other cached response', () => {
    const client = new QueryClient();
    client.setQueryData(['contacts'], [{ id: 'c1' }]);

    endSession(client);

    expect(client.getQueryData(['contacts'])).toBeUndefined();
  });
});

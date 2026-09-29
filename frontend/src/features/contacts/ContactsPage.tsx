import { useState } from 'react';
import { errorText } from '@/shared/api/errors';
import { ErrorMessage } from '@/shared/ui/ErrorMessage';
import { contactsPath } from './api';
import type { Contact, ContactParams } from './api';
import { ContactsTable } from './ContactsTable';
import { ContactsToolbar } from './ContactsToolbar';
import { useContacts } from './queries';
import { rowCount } from './table';
import './contacts.css';

// Matches the API defaults: newest first, 50 rows.
const DEFAULT_PARAMS: ContactParams = {
  status: '',
  company: '',
  sort: '-createdAt',
  limit: 50,
};

// A fresh [] each render would make the table rebuild its rows every time.
const NO_CONTACTS: Contact[] = [];

// Table state is the query: every control changes `params`, and `params` is
// the request.
export function ContactsPage() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const query = useContacts(params);

  const contacts = query.data?.contacts ?? NO_CONTACTS;
  const loaded = query.data !== undefined;
  const stale = query.isPlaceholderData;
  const paged = !stale && (query.data?.pageCount ?? 0) > 1;

  return (
    <div className="panel contacts">
      <ContactsToolbar
        limit={params.limit}
        onSearch={(filters) => setParams({ ...params, ...filters })}
        onLimitChange={(limit) => setParams({ ...params, limit })}
      />

      <ContactsTable
        contacts={contacts}
        params={params}
        onSortChange={(sort) => setParams({ ...params, sort })}
        stale={stale}
      >
        {/* A 401 is handled globally (back to /login). Anything else is
            shown, so a dead backend never looks like "no contacts". */}
        {query.isError ? (
          <ErrorMessage className="table-message">
            {errorText(query.error)}
          </ErrorMessage>
        ) : (
          loaded &&
          contacts.length === 0 && (
            <p className="table-message muted">
              No contacts match these filters.
            </p>
          )
        )}
      </ContactsTable>

      {loaded && (
        <div className="table-footer">
          <span className="mono muted">
            {rowCount(contacts.length, query.hasNextPage)}
          </span>
          {query.hasNextPage && (
            <button
              className="button"
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage || stale}
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {/* The cursor is long base64 noise; showing that one was sent is enough. */}
      <p className="request-line">
        GET /v1{contactsPath(params)}
        {paged && '&cursor=…'}
      </p>
    </div>
  );
}

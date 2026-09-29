import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, contactsPath, listContacts } from '../api';
import type { Contact, ContactParams } from '../api';
import { formatCell, formatDate, nextSort, rowCount } from '../contacts';
import type { SortColumn } from '../contacts';

function Text({ value, mono }: { value: string; mono?: boolean }) {
  const className = value === '' ? 'muted' : mono ? 'mono' : undefined;
  return <span className={className}>{formatCell(value)}</span>;
}

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, Contact>();
const columns = helper.columns([
  helper.accessor('name', {
    header: 'Name',
    cell: (info) => <Text value={info.getValue()} />,
  }),
  helper.accessor('email', {
    header: 'Email',
    cell: (info) => <Text value={info.getValue()} mono />,
  }),
  helper.accessor('company', {
    header: 'Company',
    cell: (info) => <Text value={info.getValue()} />,
  }),
  helper.accessor('jobTitle', {
    header: 'Job title',
    cell: (info) => <Text value={info.getValue()} />,
  }),
  helper.accessor('phone', {
    header: 'Phone',
    cell: (info) => <Text value={info.getValue()} mono />,
  }),
  helper.accessor('status', {
    header: 'Status',
    cell: (info) => <Text value={info.getValue()} />,
  }),
  helper.accessor('createdAt', {
    header: 'Created',
    cell: (info) => <Text value={formatDate(info.getValue())} mono />,
  }),
]);

function isSortColumn(id: string): id is SortColumn {
  return id === 'name' || id === 'company' || id === 'createdAt';
}

// Matches the API defaults: newest first, 50 rows.
const defaultParams: ContactParams = {
  status: '',
  company: '',
  sort: '-createdAt',
  limit: 50,
};

// A fresh [] each render would make the table rebuild its rows every time.
const noContacts: Contact[] = [];

export function ContactsPage() {
  const [params, setParams] = useState(defaultParams);
  const [statusInput, setStatusInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Typing changes nothing; Search (or Enter) sends one request. Trimmed here
  // too, so "Acme " and "Acme" share a query key.
  function search(e: FormEvent) {
    e.preventDefault();
    setParams({
      ...params,
      status: statusInput.trim(),
      company: companyInput.trim(),
    });
  }

  // New results start at the top, not wherever the old list was scrolled to.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [params]);

  // A new key (any control changed) starts paging over from page one.
  const contacts = useInfiniteQuery({
    queryKey: ['contacts', params],
    queryFn: ({ pageParam }) => listContacts(params, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    // Keep the old rows on screen (dimmed) while the new ones load.
    placeholderData: keepPreviousData,
  });

  const { data } = contacts;
  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? noContacts,
    [data],
  );

  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (contact) => contact.id,
  });

  const stale = contacts.isPlaceholderData;
  const paged = !stale && data !== undefined && data.pages.length > 1;

  return (
    <div className="panel contacts">
      <form className="toolbar" onSubmit={search}>
        <label className="toolbar-field">
          <span>Status</span>
          <input
            className="input toolbar-search"
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value)}
          />
        </label>
        <label className="toolbar-field">
          <span>Company</span>
          <input
            className="input toolbar-search"
            value={companyInput}
            onChange={(e) => setCompanyInput(e.target.value)}
          />
        </label>
        <button className="button" type="submit">
          Search
        </button>
        <label className="toolbar-field toolbar-end">
          <span>Limit</span>
          <select
            className="input"
            value={params.limit}
            onChange={(e) =>
              setParams({ ...params, limit: Number(e.target.value) })
            }
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </form>

      <div className="table-scroll" ref={scrollRef}>
        <table className={stale ? 'table table-stale' : 'table'}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const id = header.column.id;
                  if (!isSortColumn(id)) {
                    return (
                      <th key={header.id} data-column={header.column.id}>
                        <table.FlexRender header={header} />
                      </th>
                    );
                  }
                  const direction =
                    params.sort === id
                      ? 'ascending'
                      : params.sort === `-${id}`
                        ? 'descending'
                        : undefined;
                  return (
                    <th
                      key={header.id}
                      data-column={id}
                      aria-sort={direction}
                      className={direction && 'sorted'}
                    >
                      <button
                        className="sort"
                        type="button"
                        onClick={() =>
                          setParams({
                            ...params,
                            sort: nextSort(params.sort, id),
                          })
                        }
                      >
                        <table.FlexRender header={header} />
                        <span className={direction ? undefined : 'faint'}>
                          {direction === 'ascending'
                            ? '↑'
                            : direction === 'descending'
                              ? '↓'
                              : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} data-column={cell.column.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* A 401 is handled globally (back to /login). Anything else is
            shown, so a dead backend never looks like "no contacts". */}
        {contacts.isError ? (
          <p className="table-message error" role="alert">
            ✕{' '}
            {contacts.error instanceof ApiError
              ? `${contacts.error.message} (${contacts.error.status})`
              : contacts.error.message}
          </p>
        ) : (
          data !== undefined &&
          rows.length === 0 && (
            <p className="table-message muted">
              No contacts match these filters.
            </p>
          )
        )}
      </div>

      {data !== undefined && (
        <div className="table-footer">
          <span className="mono muted">
            {rowCount(rows.length, contacts.hasNextPage)}
          </span>
          {contacts.hasNextPage && (
            <button
              className="button"
              type="button"
              onClick={() => contacts.fetchNextPage()}
              disabled={contacts.isFetchingNextPage || stale}
            >
              {contacts.isFetchingNextPage ? 'Loading…' : 'Load more'}
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

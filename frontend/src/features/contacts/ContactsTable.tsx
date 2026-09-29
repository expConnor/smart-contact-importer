import { useTable } from '@tanstack/react-table';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Contact, ContactParams, ContactSort } from './api';
import { columns, features } from './columns';
import { isSortColumn, nextSort, sortDirection } from './table';
import type { SortColumn } from './table';

const SORT_ICONS = { ascending: '↑', descending: '↓' } as const;

// Shows the rows it is given, in the order given. A sortable header sends
// the next sort up; it never reorders rows here.
export function ContactsTable({
  contacts,
  params,
  onSortChange,
  stale,
  children,
}: {
  contacts: Contact[];
  params: ContactParams;
  onSortChange: (sort: ContactSort) => void;
  // Old rows kept on screen while new ones load: dimmed.
  stale: boolean;
  // Under the rows: the empty or error message.
  children?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const table = useTable({
    features,
    columns,
    data: contacts,
    getRowId: (contact) => contact.id,
  });

  // New results start at the top, not wherever the old list was scrolled to.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [params]);

  return (
    <div className="table-scroll" ref={scrollRef}>
      <table className={stale ? 'table table-stale' : 'table'}>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const id = header.column.id;
                const label = <table.FlexRender header={header} />;
                return isSortColumn(id) ? (
                  <SortableHeader
                    key={header.id}
                    column={id}
                    sort={params.sort}
                    onSortChange={onSortChange}
                  >
                    {label}
                  </SortableHeader>
                ) : (
                  <th key={header.id} data-column={id}>
                    {label}
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
      {children}
    </div>
  );
}

function SortableHeader({
  column,
  sort,
  onSortChange,
  children,
}: {
  column: SortColumn;
  sort: ContactSort;
  onSortChange: (sort: ContactSort) => void;
  children: ReactNode;
}) {
  const direction = sortDirection(sort, column);

  return (
    <th
      data-column={column}
      aria-sort={direction}
      className={direction && 'sorted'}
    >
      <button
        className="sort"
        type="button"
        onClick={() => onSortChange(nextSort(sort, column))}
      >
        {children}
        <span className={direction ? undefined : 'faint'}>
          {direction ? SORT_ICONS[direction] : '↕'}
        </span>
      </button>
    </th>
  );
}

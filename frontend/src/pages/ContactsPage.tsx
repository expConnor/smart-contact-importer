import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ApiError, listContacts } from '../api';
import type { Contact } from '../api';
import { formatCell, formatDate, rowCount } from '../contacts';

function Text({ value, mono }: { value: string; mono?: boolean }) {
  const className = value === '' ? 'muted' : mono ? 'mono' : undefined;
  return <span className={className}>{formatCell(value)}</span>;
}

// The dot's colour comes from CSS keyed on data-status, so unknown values
// imported from a CSV still render (grey).
function Status({ value }: { value: string }) {
  if (value === '') return <Text value={value} />;
  return (
    <span className="status" data-status={value}>
      {value}
    </span>
  );
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
    cell: (info) => <Status value={info.getValue()} />,
  }),
  helper.accessor('createdAt', {
    header: 'Created',
    cell: (info) => <Text value={formatDate(info.getValue())} mono />,
  }),
]);

// A fresh [] each render would make the table rebuild its rows every time.
const noContacts: Contact[] = [];

export function ContactsPage() {
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: listContacts });

  const table = useTable({
    features,
    columns,
    data: contacts.data?.items ?? noContacts,
    getRowId: (contact) => contact.id,
  });

  if (contacts.isPending) return null;

  // A 401 is handled globally (back to /login). Anything else is shown, so a
  // dead backend never looks like "no contacts".
  if (contacts.isError) {
    const { error } = contacts;
    return (
      <p className="error" role="alert">
        ✕{' '}
        {error instanceof ApiError
          ? `${error.message} (${error.status})`
          : error.message}
      </p>
    );
  }

  const { items, nextCursor } = contacts.data;

  return (
    <div className="panel">
      <div className="table-scroll">
        <table className="table">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    <table.FlexRender header={header} />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-footer">
        {rowCount(items.length, nextCursor !== null)}
      </p>
    </div>
  );
}

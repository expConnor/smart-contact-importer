import { createColumnHelper, tableFeatures } from '@tanstack/react-table';
import type { Contact } from './api';
import { formatCell, formatDate } from './table';

// No sorting or filtering features: the server does both.
export const features = tableFeatures({});

const helper = createColumnHelper<typeof features, Contact>();

// A plain function, not a component: this file exports only data, so fast
// refresh can reload it.
function text(value: string, mono = false) {
  const className = value === '' ? 'dim' : mono ? 'mono' : undefined;
  return <span className={className}>{formatCell(value)}</span>;
}

export const columns = helper.columns([
  helper.accessor('name', {
    header: 'Name',
    cell: (info) => text(info.getValue()),
  }),
  helper.accessor('email', {
    header: 'Email',
    cell: (info) => text(info.getValue(), true),
  }),
  helper.accessor('company', {
    header: 'Company',
    cell: (info) => text(info.getValue()),
  }),
  helper.accessor('jobTitle', {
    header: 'Job title',
    cell: (info) => text(info.getValue()),
  }),
  helper.accessor('phone', {
    header: 'Phone',
    cell: (info) => text(info.getValue(), true),
  }),
  helper.accessor('status', {
    header: 'Status',
    cell: (info) => text(info.getValue()),
  }),
  helper.accessor('createdAt', {
    header: 'Created',
    cell: (info) => text(formatDate(info.getValue()), true),
  }),
]);

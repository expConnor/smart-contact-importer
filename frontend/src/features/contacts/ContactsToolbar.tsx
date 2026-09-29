import { useState } from 'react';
import type { FormEvent } from 'react';

type Filters = { status: string; company: string };

const LIMITS = [25, 50, 100];

// Typing changes nothing; Search (or Enter) sends one request. The limit
// applies at once.
export function ContactsToolbar({
  limit,
  onSearch,
  onLimitChange,
}: {
  limit: number;
  onSearch: (filters: Filters) => void;
  onLimitChange: (limit: number) => void;
}) {
  const [status, setStatus] = useState('');
  const [company, setCompany] = useState('');

  // Trimmed here, so "Acme " and "Acme" share a query key.
  function search(event: FormEvent) {
    event.preventDefault();
    onSearch({ status: status.trim(), company: company.trim() });
  }

  return (
    <form className="toolbar" onSubmit={search}>
      <label className="toolbar-field">
        <span>Status</span>
        <input
          className="input toolbar-search"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        />
      </label>
      <label className="toolbar-field">
        <span>Company</span>
        <input
          className="input toolbar-search"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />
      </label>
      <button className="button" type="submit">
        Search
      </button>
      <label className="toolbar-field toolbar-end">
        <span>Limit</span>
        <select
          className="input"
          value={limit}
          onChange={(event) => onLimitChange(Number(event.target.value))}
        >
          {LIMITS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

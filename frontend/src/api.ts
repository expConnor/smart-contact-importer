export type User = { id: string; email: string };

export type Contact = {
  id: string;
  email: string;
  name: string;
  company: string;
  jobTitle: string;
  phone: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactPage = { items: Contact[]; nextCursor: string | null };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorText(error: Error): string {
  return error instanceof ApiError
    ? `${error.message} (${error.status})`
    : error.message;
}

// One answered request, as the request log sees it. `path` has no `/v1`.
export type ApiCall = {
  method: string;
  path: string;
  code: number;
  body: unknown;
};

let responseListener: (call: ApiCall) => void = () => {};

// The request log hears every answer, success or error, without each call
// site passing the status code along.
export function onResponse(listener: (call: ApiCall) => void): void {
  responseListener = listener;
}

type ErrorEnvelope = {
  error?: { code?: unknown; message?: unknown; details?: unknown };
};

// The backend always answers `{ error: { code, message, details? } }`. Anything
// else (the Vite proxy's HTML 502, an empty 500) did not come from our code.
export function parseError(
  status: number,
  statusText: string,
  body: unknown,
): ApiError {
  const error = (body as ErrorEnvelope | null | undefined)?.error;
  if (typeof error?.code !== 'string') {
    return new ApiError(status, 'INTERNAL', statusText);
  }
  const message =
    typeof error.message === 'string' ? error.message : statusText;
  return new ApiError(status, error.code, message, error.details);
}

// FormData goes as is: the browser sets the multipart Content-Type with its
// boundary. Anything else is sent as JSON.
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/v1${path}`, {
    method,
    headers: {
      ...(body === undefined || isForm
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = text || undefined;
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON: keep the raw text so parseError can fall back.
  }
  responseListener({ method, path, code: res.status, body: data });

  if (!res.ok) throw parseError(res.status, res.statusText, data);
  return data as T;
}

// 401 is an answer here, not a failure: nobody is logged in.
export async function getMe(): Promise<User | null> {
  try {
    return await request<User>('GET', '/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function login(credentials: {
  email: string;
  password: string;
}): Promise<User> {
  return request<User>('POST', '/auth/login', credentials);
}

export function logout(): Promise<void> {
  return request<void>('POST', '/auth/logout');
}

export type ContactSort =
  'name' | '-name' | 'company' | '-company' | 'createdAt' | '-createdAt';

export type ContactParams = {
  status: string;
  company: string;
  sort: ContactSort;
  limit: number;
};

// Empty filters are left out: the API rejects `status=`.
export function contactsPath(params: ContactParams, cursor?: string): string {
  const query = new URLSearchParams({
    sort: params.sort,
    limit: String(params.limit),
  });
  const status = params.status.trim();
  const company = params.company.trim();
  if (status !== '') query.set('status', status);
  if (company !== '') query.set('company', company);
  if (cursor !== undefined) query.set('cursor', cursor);
  return `/contacts?${query}`;
}

export function listContacts(
  params: ContactParams,
  cursor: string | null,
): Promise<ContactPage> {
  return request<ContactPage>('GET', contactsPath(params, cursor ?? undefined));
}

export type ImportStatus =
  | 'PENDING_ANALYSIS'
  | 'ANALYZING'
  | 'AWAITING_MAPPING'
  | 'PENDING_IMPORT'
  | 'IMPORTING'
  | 'COMPLETED'
  | 'FAILED';

export type TargetField =
  'email' | 'name' | 'company' | 'jobTitle' | 'phone' | 'status' | '__ignore__';

export type ColumnMapping = {
  sourceColumn: string;
  targetField: TargetField;
  confidence: number;
};

export type MappingPayload = {
  headerRowIndex: number;
  mappings: ColumnMapping[];
};

export type InferenceSource = 'HEURISTIC' | 'LLM';

// rowNumber is the spreadsheet row: header and preamble lines count.
export type ImportRowError = {
  rowNumber: number;
  field: string | null;
  message: string;
  rawRow: Record<string, string>;
};

// Only the fields the UI reads today. The analysis fields stay null until the
// job reaches AWAITING_MAPPING. The counts stay 0 and errors stay [] until the
// import settles; errors holds the first 100 by row.
export type ImportJob = {
  id: string;
  status: ImportStatus;
  headerRowIndex: number | null;
  sampleRows: string[][] | null;
  proposedMapping: ColumnMapping[] | null;
  inferenceSource: InferenceSource | null;
  failureReason: string | null;
  totalRows: number | null;
  importedRows: number;
  failedRows: number;
  errors: ImportRowError[];
};

// Same key + same bytes answers with the same job, so a retry is safe.
export function createImport(file: File, key: string): Promise<{ id: string }> {
  const form = new FormData();
  form.append('file', file);
  return request<{ id: string }>('POST', '/imports', form, {
    'Idempotency-Key': key,
  });
}

export function getImport(id: string): Promise<ImportJob> {
  return request<ImportJob>('GET', `/imports/${encodeURIComponent(id)}`);
}

// Answers 202 with the job, now PENDING_IMPORT.
export function confirmMapping(
  id: string,
  payload: MappingPayload,
): Promise<ImportJob> {
  return request<ImportJob>(
    'POST',
    `/imports/${encodeURIComponent(id)}/mapping`,
    payload,
  );
}

export type ImportSummary = {
  id: string;
  status: ImportStatus;
  originalFilename: string;
};

// The caller's newest 100 jobs, newest first.
export function listImports(): Promise<{ items: ImportSummary[] }> {
  return request<{ items: ImportSummary[] }>('GET', '/imports');
}

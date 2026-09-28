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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/v1${path}`, {
    method,
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = text || undefined;
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON: keep the raw text so parseError can fall back.
  }

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

// No params: the API defaults to 50 rows, newest first.
export function listContacts(): Promise<ContactPage> {
  return request<ContactPage>('GET', '/contacts');
}

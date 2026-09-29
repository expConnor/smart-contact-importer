// The one fetch wrapper. Each feature's `api.ts` calls `request` with its own
// paths and types; this file knows nothing about contacts or imports.

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
export async function request<T>(
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

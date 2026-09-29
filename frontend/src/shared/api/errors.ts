import { ApiError } from './client';

// One line for any failed call: the server's message and status, or the
// browser's message when the request never got an answer.
export function errorText(error: Error): string {
  return error instanceof ApiError
    ? `${error.message} (${error.status})`
    : error.message;
}

// The envelope message is generic ("Request validation failed"); the first
// detail says what to fix.
export function firstDetailMessage(error: ApiError): string | undefined {
  if (!Array.isArray(error.details)) return undefined;
  const message = (error.details[0] as { message?: unknown } | undefined)
    ?.message;
  return typeof message === 'string' ? message : undefined;
}

# Errors: HTTP envelope — design

Date: 2026-09-08 · Status: draft, not implemented

One exception class, one catalogue file, one filter. The mechanism is final for the project; the catalogue grows a row per slice. Nest's built-in exceptions keep working, so there is no wrong way to throw.

---

## Scope

| In | Out |
| --- | --- |
| Envelope shape for all non-2xx, every slice | Logging / metrics / tracing stack |
| `AppError` + catalogue + one filter | i18n of `message` |
| `ValidationPipe` → same envelope | Retry, backoff, circuit breaking |
| Nest built-in exceptions normalised | Frontend error rendering (no `frontend/` yet) |
| Catalogue rows for auth only, today | Row-level import failures — a **200**, see *Not this envelope* |

---

## Decisions

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| D1 | Envelope | `{ error: { code, message, details? } }` | A client tests `'error' in body`; no collision with a success body |
| D2 | Status in body | No | HTTP status is the transport's job; two sources drift |
| D3 | Exception surface | One class, `AppError`, taking a code | Twelve Nest subclasses means twelve things to know and a status decision at every throw |
| D4 | Status + default message | Live in the catalogue, keyed by code | A throw site cannot pick a wrong status because it never picks one |
| D5 | `ErrorCode` union | Derived from the catalogue via `keyof typeof` | Adding a code without a status stops being expressible |
| D6 | Nest built-ins | Normalised by the filter, not banned | The router throws 404 itself; libraries throw `HttpException`. Banning what you cannot prevent produces two shapes |
| D7 | Unknown throwable | `500 INTERNAL`, fixed message, stack logged | Prisma errors carry table and column names |
| D8 | Stack traces in body | Never, any env | One less env-dependent path to get wrong |
| D9 | Validation errors | `ValidationPipe({ exceptionFactory })` → `AppError('VALIDATION_FAILED')` | Otherwise 400s are the one shape that escapes the envelope |
| D10 | `details` type | `unknown` | Per-code generics cost every call site more than a typed error payload returns |

---

## Catalogue

Auth rows only. Later slices append; nothing else changes.

| `code` | Status | Raised when | `details` |
| --- | --- | --- | --- |
| `VALIDATION_FAILED` | 400 | DTO fails `class-validator` | `FieldError[]` |
| `UNAUTHORIZED` | 401 | Bad credentials, missing/invalid/expired cookie | — |
| `NOT_FOUND` | 404 | Unmatched route; later, a row that is absent or not yours | — |
| `INTERNAL` | 500 | Anything uncaught | — |

`401` is byte-identical across all its causes — the auth spec's no-enumeration rule.

---

## How to use it

Three rules. Everything else follows.

| Situation | Write |
| --- | --- |
| Credentials rejected | `throw new AppError('UNAUTHORIZED')` |
| Needs a payload | `throw new AppError('INVALID_SORT', { allowed })` |
| Needs a one-off message | `throw new AppError('NOT_FOUND', undefined, 'Import not found')` |
| Something unexpected went wrong | Nothing. Let it throw |

1. **Never pass an HTTP status.** The catalogue owns it.
2. **Never wrap an unknown error.** `catch (e) { throw new AppError('INTERNAL') }` discards the stack and the cause. Let it bubble to the filter, which logs it properly.
3. **A `throw` is not a `return`.** Partial failures — three good rows, two bad — are a 200 with a body, not an exception.

---

## Shapes

```ts
// error-catalogue.ts — the only file a new error touches
const CATALOGUE = {
  VALIDATION_FAILED: { status: 400, message: 'Request validation failed' },
  UNAUTHORIZED:      { status: 401, message: 'Invalid credentials' },
  NOT_FOUND:         { status: 404, message: 'Not found' },
  INTERNAL:          { status: 500, message: 'Internal server error' },
} satisfies Record<string, { status: HttpStatus; message: string }>;

type ErrorCode = keyof typeof CATALOGUE;          // D5
type FieldError = { field: string; message: string };
type ErrorBody = { error: { code: ErrorCode; message: string; details?: unknown } };

class AppError extends HttpException {
  readonly code: ErrorCode;
  readonly details?: unknown;
  // message defaults to CATALOGUE[code].message; status is never a parameter
  constructor(code: ErrorCode, details?: unknown, message?: string);
}

class AppErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void;
}
```

---

## Filter flow

`@Catch()` with no argument — one filter, so ordering never arises.

| # | Exception is | Status | `code` | Log |
| --- | --- | --- | --- | --- |
| 1 | `AppError` | `CATALOGUE[code].status` | its own | `warn` |
| 2 | `HttpException` | its own `getStatus()` | `STATUS_TO_CODE[status] ?? 'INTERNAL'` | `warn` |
| 3 | anything else | 500 | `INTERNAL` | `error`, with stack |

Branch 2 keeps the thrown status and only supplies a code — never `CATALOGUE[code].status`, or a framework 404 would be relabelled 500. Branch 3 is the only one that logs a stack and the only one that puts nothing from the exception in the body.

---

## Adding a code

| Step | Where |
| --- | --- |
| 1 | Add one row to `CATALOGUE` |
| 2 | — there is no step 2 |

The union, the status lookup and autocomplete at every throw site all derive from that row.

Expected rows, when their slice arrives: `INVALID_SORT` 400, `INVALID_CURSOR` 400, `CONFLICT` 409, `PAYLOAD_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `MAPPING_INVALID` 422.

---

## Not this envelope

| Kind | Where it goes | Why |
| --- | --- | --- |
| Import row failures | `ImportError` rows in a **200** from `GET /v1/imports/:id` | A partly-successful import is a success |
| LLM returned garbage | Caught, logged, heuristic fallback | SPEC: an unreliable dependency may degrade, not block |

---

## Files

| File | Contains |
| --- | --- |
| `src/common/errors/error-catalogue.ts` | `CATALOGUE`, `ErrorCode`, `ErrorBody`, `FieldError`, `STATUS_TO_CODE` |
| `src/common/errors/app.error.ts` | `AppError` |
| `src/common/errors/app-error.filter.ts` | `AppErrorFilter` — the only place a body is written |
| `src/app.module.ts` | `{ provide: APP_FILTER, useClass: AppErrorFilter }` — provider, not `useGlobalFilters`, so DI gives the filter its logger |
| `src/main.ts` | `ValidationPipe` with `exceptionFactory` |

---

## Prerequisites

| Item | Action |
| --- | --- |
| `main.ts` | `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory })` |
| `main.ts` | `app.use(cookieParser())` — auth spec |
| `auth.service.ts` | `throw new Error('UNAUTHORIZED')` → `throw new AppError('UNAUTHORIZED')` |

---

## Tests

| # | Test | Proves |
| --- | --- | --- |
| 1 | `POST /v1/auth/login` `{}` → 400, matches `ErrorBody`, `details` is `FieldError[]` | The pipe uses the envelope, not Nest's default |
| 2 | Wrong password vs unknown email → both 401, bodies deep-equal | D3 + no enumeration |
| 3 | Test-only route throwing a raw `Error` → 500 `INTERNAL`, no stack, not the thrown message | D7, D8 |
| 4 | `GET /v1/does-not-exist` → 404 `NOT_FOUND` in envelope shape | D6 — the framework's own throw is normalised |

Test 3's throwing route is registered in the test module only. Do not add it to `AppModule`.

Verification: `cd backend && npm run check`.

---

## Known tradeoffs

| Tradeoff | Accepted because |
| --- | --- |
| `details` is `unknown` | Per-code discriminated unions cost generics at every call site; the client mostly reads `code` |
| No `requestId` | Needs request-scoped middleware. Add when a real log sink exists |
| Built-in exceptions get a generic message | Their own messages are already generic; branch 2 exists so the *shape* never varies |
| One flat catalogue, no per-domain error classes | ~10 codes across four modules. Subclass hierarchies pay off past ~30 |

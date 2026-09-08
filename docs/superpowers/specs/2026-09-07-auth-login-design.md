# Auth: login flow — design

Date: 2026-09-07 · Status: approved, not implemented

Stateless JWT in an httpOnly cookie. Deny-by-default global guard. Single seeded user set, no signup.

---

## Scope

| In | Out |
| --- | --- |
| `POST /v1/auth/login` | Signup / registration |
| `POST /v1/auth/logout` | Password reset, email verification |
| `GET /v1/me` | Refresh tokens, token rotation |
| JWT sign/verify + cookie policy | Roles, permissions, multi-tenant orgs |
| Global `JwtAuthGuard` + `@Public()` | Token revocation / denylist |
| `@CurrentUser()` decorator | Frontend login page (no `frontend/` yet) |

---

## Decisions

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| D1 | Session mechanism | Stateless JWT, httpOnly cookie | SPEC mandates it; no session table, no Redis |
| D2 | Guard posture | Deny by default (`APP_GUARD`), `@Public()` opts out | Forgotten annotation fails closed, never open |
| D3 | JWT library | `@nestjs/jwt` | DI-friendly, config read once; no Passport for one credential type |
| D4 | HTTP validation | `class-validator` + built-in `ValidationPipe` | Nest-idiomatic; zod reserved for LLM output validation |
| D5 | Password hashing | argon2id, already in `prisma/seed.ts` | Seed and verify must share options |
| D6 | Guard DB lookup | None — signature is the proof | `GET /me` is the only route needing the fresh row |
| D7 | Cookie `maxAge` | Derived from the signed token's `exp` claim | One source of truth; cookie and token cannot drift |
| D8 | Logout auth | `@Public()` | An expired cookie must still be clearable |
| D9 | Revocation | None | Denylist = table + per-request lookup; httpOnly + 5d expiry is the accepted trade |

---

## Dependencies to add

| Package | Kind |
| --- | --- |
| `@nestjs/jwt` | dep |
| `class-validator` | dep |
| `class-transformer` | dep |
| `cookie-parser` | dep |
| `@types/cookie-parser` | devDep |

Already present: `argon2`, `reflect-metadata`, `@prisma/client`, `supertest`.

---

## Prerequisites

| Item | Action |
| --- | --- |
| `JWT_SECRET` in `backend/.env.example` is 21 chars; `env.ts` requires `min(32)` | Replace with a ≥32-char dev value — app exits at boot otherwise |
| `main.ts` | Add `app.use(cookieParser())` |
| `main.ts` | Add global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` |
| `main.ts` | Add `app.enableCors({ origin, credentials: true })` — deferred until `frontend/` exists |
| `tsconfig.json` | No change; `emitDecoratorMetadata` + `experimentalDecorators` already on |
| DTO fields | Definite assignment (`email!: string`) — `strict: true` implies `strictPropertyInitialization`. Do not disable the flag globally |

---

## Files

All under `backend/src/auth/` unless noted.

| File | Contains |
| --- | --- |
| `auth.module.ts` | `JwtModule.register` from env; binds `APP_GUARD` → `JwtAuthGuard` |
| `auth.controller.ts` | `POST /v1/auth/login`, `POST /v1/auth/logout` |
| `me.controller.ts` | `GET /v1/me` — root path, so a separate controller |
| `auth.service.ts` | Credential verification, token issuance |
| `token.service.ts` | JWT sign / verify |
| `jwt-auth.guard.ts` | Global guard |
| `cookie.ts` | Cookie name + options, defined once |
| `dto/login.dto.ts` | `LoginDto` with `@IsEmail()` / `@IsString()` |
| `decorators/public.decorator.ts` | `@Public()` via `SetMetadata` |
| `decorators/current-user.decorator.ts` | `@CurrentUser()` param decorator |
| `types.ts` | `JwtPayload`, `AuthenticatedRequest`, `PublicUser` |

Replaces the current stub `auth.service.ts`, whose `login()` returns an unfiltered `prisma.user.findFirst()`.

---

## Shapes

```ts
type JwtPayload = { sub: string; iat: number; exp: number };
type PublicUser = { id: string; email: string };
type AuthenticatedRequest = Request & { user: { userId: string } };

class LoginDto { email!: string; password!: string }

// auth.service.ts
login(dto: LoginDto): Promise<{ user: PublicUser; token: string }>;

// token.service.ts
sign(sub: string): string;
verify(token: string): JwtPayload; // throws on bad signature or expiry
```

---

## Contracts

| Method | Path | Auth | Body in | Out |
| --- | --- | --- | --- | --- |
| POST | `/v1/auth/login` | public | `LoginDto` | `200 PublicUser` + `Set-Cookie` |
| POST | `/v1/auth/logout` | public | — | `204` + clearing `Set-Cookie` |
| GET | `/v1/me` | required | — | `200 PublicUser` |

The token travels only in the cookie. It is never in a response body.

---

## Login flow

1. `ValidationPipe` parses body → `LoginDto`; malformed or extra fields → 400.
2. `prisma.user.findUnique({ where: { email } })`.
3. No user → `argon2.verify` against a constant throwaway hash, then 401. Equalises timing so the missing-email path cannot be distinguished by latency.
4. User found → `argon2.verify(user.passwordHash, password)`; false → 401.
5. `token.sign(user.id)`.
6. Decode `exp` off the signed token → cookie `maxAge`.
7. `res.cookie(...)` via `@Res({ passthrough: true })`; return `PublicUser`.

---

## Guard flow

1. `reflector.getAllAndOverride(IS_PUBLIC, [handler, class])` → true ⇒ allow.
2. `req.cookies[COOKIE_NAME]` absent ⇒ 401.
3. `token.verify()` throws ⇒ 401.
4. `req.user = { userId: payload.sub }` ⇒ proceed.

---

## Cookie policy

Single definition in `cookie.ts`; logout must clear with identical attributes or the browser ignores it.

| Attribute | Value | Reason |
| --- | --- | --- |
| name | `access_token` | |
| `httpOnly` | `true` | XSS cannot read it |
| `secure` | `NODE_ENV === 'production'` | Dev is plain http |
| `sameSite` | `lax` | Vite `:5173` → API `:3000` is cross-origin but same-site |
| `path` | `/` | Must match on clear |
| `maxAge` | token `exp` − now | D7 |

---

## Failure modes

| Case | Status | Body |
| --- | --- | --- |
| Malformed or extra body fields | 400 | Validation detail |
| Unknown email | 401 | `Invalid credentials` |
| Wrong password | 401 | `Invalid credentials` — byte-identical to above |
| Missing cookie | 401 | `Unauthorized` |
| Bad signature | 401 | `Unauthorized` |
| Expired token | 401 | `Unauthorized` |

No response distinguishes "user does not exist" from "wrong password".

---

## Tests

`supertest`, against the seeded user `user1@test.com` / `develop`.

| # | Test | Proves |
| --- | --- | --- |
| 1 | Valid creds → 200 + `Set-Cookie` with `HttpOnly` | Happy path issues an unreadable cookie |
| 2 | Wrong password → 401, no `Set-Cookie` | Failure issues nothing |
| 3 | Unknown email → 401, body identical to #2 | No user enumeration |
| 4 | `GET /me` with no cookie → 401 | Guard is on by default |
| 5 | `GET /me` with cookie → seeded user | Guard populates `userId` |
| 6 | Logout → clearing `Set-Cookie`; `/me` after → 401 | Clear attributes match |

Verification: `cd backend && npm run check`.

---

## Known tradeoffs

| Tradeoff | Accepted because |
| --- | --- |
| JWT stays valid until `exp` after logout | Denylist costs a table + per-request lookup; token was never JS-readable. Note in README |
| Guard trusts the token without a DB read | A deleted or disabled user keeps access until expiry. No such flow exists in scope |
| `sameSite: lax` | Frontend and API share `localhost`. Revisit if they are ever deployed on different sites |

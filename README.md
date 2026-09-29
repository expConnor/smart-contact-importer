# Smart Contact Import

Ingestion path for arbitrary customer CSV contact exports: infer the column
mapping, confirm it with the user, import in the background, browse the result.

See [SPEC.md](SPEC.md) for scope.

## Requirements

- Docker (Compose v2)
- Node 22.9+ (the test scripts use `--env-file-if-exists`)

## Running

```bash
docker compose up -d        # Postgres on localhost:5432
docker compose ps           # wait for STATUS = healthy
```

No root `.env` is required — dev defaults live in `compose.yaml`. Copy
[.env.example](.env.example) to `.env` only to override them (e.g. `DB_PORT`
if you already run Postgres on 5432). The backend needs its own `.env`; see
below.

| Setting  | Default                  |
| -------- | ------------------------ |
| Host     | `localhost:5432`         |
| Database | `smart_contact_importer` |
| User     | `app`                    |
| Password | `app`                    |

Dev-only credentials for a container bound to localhost.

### Useful

```bash
docker compose logs -f db   # tail Postgres
docker compose down         # stop, keep data
docker compose down -v      # stop, destroy the pgdata volume
```

## Backend

```bash
cd backend
npm install
cp .env.example .env        # required: DATABASE_URL has no default
npm run db:migrate          # apply migrations to the dev database
npm run db:seed             # 1 user + 200 contacts; re-runnable, upserts
npm run check               # format, lint, test, build
npm run dev                 # http://localhost:3000, API + worker
```

Unlike the root `.env`, this one is not optional — Prisma throws on a missing
`DATABASE_URL` rather than falling back. If you changed `DB_PORT` at the root,
change the port in `DATABASE_URL` to match.

`npm run dev` also runs the background worker in the same process. It polls
Postgres for queued import jobs. Set `WORKER_ENABLED=false` to serve HTTP only
(then nothing processes uploads). Uploaded CSVs are stored in
`backend/uploads/` (gitignored).

`ANTHROPIC_API_KEY` is optional and empty by default. Column inference uses a
deterministic heuristic without it. No LLM call is wired up yet, so today the
heuristic always runs.

Seeded login — dev-only, from [backend/prisma/seed.ts](backend/prisma/seed.ts):

| Email           | Password  |
| --------------- | --------- |
| `user@test.com` | `develop` |

### API

All routes sit under `/v1`. Everything except `auth/*` needs the auth cookie.

| Route                          | Does                                               |
| ------------------------------ | -------------------------------------------------- |
| `POST /v1/auth/login`          | sets the httpOnly JWT cookie                       |
| `POST /v1/auth/logout`         | clears it                                          |
| `GET /v1/me`                   | the logged-in user                                 |
| `GET /v1/contacts`             | cursor-paginated list; `status`, `company`, `sort` |
| `POST /v1/imports`             | multipart CSV + `Idempotency-Key` header → job id  |
| `GET /v1/imports/:id`          | job status, proposed mapping, samples              |
| `POST /v1/imports/:id/mapping` | confirm the mapping, start the import              |

Work in progress: the import step is a stub. Confirming a mapping finishes the
job, but no contacts are written yet.

### Tests

`npm run check` runs both layers. They differ in what they need:

| Script              | Needs the container? | Covers                                |
| ------------------- | -------------------- | ------------------------------------- |
| `npm run test:unit` | no                   | pure functions — no Nest, no database |
| `npm run test:e2e`  | **yes**              | the real app over HTTP, real Postgres |

So `docker compose up -d` before `npm run check`, or the e2e half fails.

E2e runs against a **separate** `smart_contact_importer_test` database and
TRUNCATEs every table between tests. It never touches your dev data: the suite
refuses to start unless the database name ends in `_test`, and
[backend/src/test/global-setup.ts](backend/src/test/global-setup.ts) applies
migrations only after that check passes. A fresh `docker compose up -d` creates
the database via [db/initdb](db/initdb); on a pre-existing volume the first
e2e run creates it.

Test settings are fixed and committed in
[backend/.env.test](backend/.env.test) — not copied from an example, so every
machine runs the same suite. **If you changed `DB_PORT` at the root, you must
also create `backend/.env.test.local`** (gitignored, loaded after `.env.test`):

```bash
echo 'DATABASE_URL=postgresql://app:app@localhost:5433/smart_contact_importer_test?schema=public' \
  > backend/.env.test.local
```

Without it, `npm run test:e2e` fails with `ECONNREFUSED` on the default port.

## Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173, needs the backend on :3000
npm run check               # format, lint, test, build
```

Vite proxies `/v1` to `http://localhost:3000`, so the browser sees one origin
and the auth cookie works without CORS. Log in with the seeded user above.

`npm run check` needs nothing running: the tests cover pure helpers only
(no DOM). Screens are checked in the browser.

| Folder                 | Holds                                                         |
| ---------------------- | ------------------------------------------------------------- |
| `src/app/`             | Routes, session guard, query client, header and sidebar       |
| `src/features/<name>/` | One feature: `api.ts` (HTTP), `queries.ts` (hooks), UI, CSS   |
| `src/shared/`          | Fetch wrapper, error text, `Panel` / `ErrorMessage`, base CSS |

`@/` imports resolve to `src/`.

## Fixtures

Sample CSVs for the import path live in [fixtures/](fixtures/) — one file per
export format, each breaking something different. See
[fixtures/README.md](fixtures/README.md).

# Smart Contact Import

Ingestion path for arbitrary customer CSV contact exports: infer the column
mapping, confirm it with the user, import in the background, browse the result.

See [SPEC.md](SPEC.md) for scope.

## Features

Upload a contact CSV in any layout. The app guesses which column is which.
You check the guess. A background worker imports the rows. Then you browse
the contacts.

The screens show how the system works, not just what it produced: job
statuses, HTTP codes, which path the guess took. It is built for engineers
checking the mechanics.

### 1. Upload a CSV

- Drop any CSV, or pick one of the repo's [fixtures](fixtures/) from the list.
- Each file gets an **Idempotency-Key**, a random id sent with the upload.
  Sending the same key again returns the same job. A double click or a retry
  never makes a second job.
- The upload returns at once. All slow work happens later, in a worker.

### 2. Watch the job move

![Job page while a worker reads the file](docs/screenshots/analysing.png)

- The timeline shows every status a job passes through. Above each step:
  what moves it (your request, a worker, or you).
- Hover a step to see what happens there, e.g. how a worker claims a job.
- The page polls (asks the server again every 250 ms) until the job needs
  you or is done.
- Grey placeholder rows hold the place of the mapping table while the worker
  reads the file.

### 3. Check the column mapping

![Mapping review for a Typeform export, headers are survey questions](docs/screenshots/mapping.png)

- One row per column in the file: its header, a few sample values, and the
  field it will import as.
- Here the headers are survey questions (`What's your work email address?`).
  The guess still maps them.
- **Confidence** is three bars and a score. Below 0.85 it turns amber or red,
  so weak guesses stand out. Change a dropdown and the row shows `manual`.
- The line under the title says which line is the header, how many rows the
  file has, and who made the guess. A LinkedIn export has 3 lines of notes
  above its header; the header detection skips them.
- Nothing is written until you click **Import contacts**. The button stays
  off while the mapping is broken: no email column, or two columns claiming
  one field.

### 4. See the result

![Finished import: counts, path taken, run facts, failed rows](docs/screenshots/result.png)

The example is `path-guess-rejected.csv`: 276 messy rows, 256 imported, 20
failed. The call to Claude failed, so the built-in rules took over and the
import still went through.

- **Counts:** rows, imported, failed.
- **Path taken:** how the mapping was guessed. The steps this job took are lit.

  | Path                                       | When                                                                                        |
  | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
  | Claude guess → validate → mapping          | an API key is set and Claude's guess fits the file                                          |
  | built-in rules (`NO_KEY`)                  | no API key                                                                                  |
  | Claude fails → rules (`GUESS_FAILED`)      | the provider is down, the key is bad, or the call errors                                    |
  | Claude rejected → rules (`GUESS_REJECTED`) | Claude's answer names a column the file lacks, maps a field twice, or leaves email unmapped |

- **Run facts:** attempts used (of 3), file size, detected encoding and
  delimiter, header row.
- **Failed rows:** row number, reason, and the raw cells. Only the email can
  fail a row (missing or not an address). A strange phone number is kept as
  typed. The API returns the first 100 failures; the table shows about ten and
  scrolls.

### 5. Prove the guarantees

The request log (right of the step 4 screenshot) lists every call this browser
tab made for the job, with its status code. Repeated polls fold into one line
(`×33`). Three buttons poke the backend:

| Button           | Sends                                       | Expect                                       |
| ---------------- | ------------------------------------------- | -------------------------------------------- |
| Replay upload    | the same file with the same key             | `200`, same job id, no new job or analysis   |
| Send bad mapping | a mapping naming a column the file lacks    | `422 MAPPING_INVALID`; the job does not move |
| Confirm again    | the mapping, after it was already confirmed | `409 CONFLICT`                               |

### 6. Browse contacts

![Contacts filtered to status "warm" and sorted by company](docs/screenshots/contacts.png)

- Filter by status and company (case-insensitive "contains"). Sort by name,
  company or created date. Pick 25, 50 or 100 rows per page.
- The table never sorts or filters rows itself. Each change becomes a new
  request, and the exact request shows under the table.
- **Load more** uses a cursor, not a page number. A cursor is an opaque token
  that marks where the last page stopped. Rows added by a running import
  can't shift pages, so no row repeats or goes missing.
- Two contacts can share a company. The row id breaks the tie, so the order
  is always fixed and page edges never drop a row.

### How the guarantees hold

| Guarantee                 | How                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One upload, one job       | `(user, Idempotency-Key)` is unique in the database. A replay returns the stored job.                                                                                                      |
| One person, one contact   | The import upserts (insert or update) on email.                                                                                                                                            |
| No slow requests          | Upload saves the file and a job row, then returns. The worker does the analysis and the import.                                                                                            |
| Safe with many workers    | A worker claims a job with `FOR UPDATE SKIP LOCKED` under a lease (a claim that expires). If the worker dies, the lease runs out and another worker retries, up to 3 times, then `FAILED`. |
| Model output is untrusted | Every mapping (Claude's, the rules', yours) passes one check: each column exists, each is used once, each field is used once, email is mapped, the header row matches.                     |
| Works with no API key     | Built-in rules match header names, keywords and value shapes.                                                                                                                              |

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

Small files finish in milliseconds, so the UI never shows the `ANALYZING` or
`IMPORTING` states. Set `WORKER_DEMO_DELAY_MS=3000` to hold each job for 3 s
before the worker runs it. Default `0` (no delay).

`ANTHROPIC_API_KEY` is optional and empty by default. It decides how the
column mapping is guessed:

- With a key: Claude guesses the mapping. On any error, the built-in rules
  take over.
- Without a key: the built-in rules only.
- Privacy: with a key, the headers and 5 sample rows (real contact data) are
  sent to Anthropic.

Seeded login — dev-only, from [backend/prisma/seed.ts](backend/prisma/seed.ts):

| Email           | Password  |
| --------------- | --------- |
| `user@test.com` | `develop` |

### API

All routes sit under `/v1`. Everything except `auth/*` needs the auth cookie.

| Route                          | Does                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| `POST /v1/auth/login`          | sets the httpOnly JWT cookie                                    |
| `POST /v1/auth/logout`         | clears it                                                       |
| `GET /v1/me`                   | the logged-in user                                              |
| `GET /v1/contacts`             | cursor-paginated list; `status`, `company`, `sort`, `limit`     |
| `POST /v1/imports`             | multipart CSV + `Idempotency-Key` header → job id               |
| `GET /v1/imports`              | the user's jobs: id, status, file name                          |
| `GET /v1/imports/:id`          | status, proposed mapping, samples, row counts, first 100 errors |
| `POST /v1/imports/:id/mapping` | confirm the mapping, start the import                           |

`status` and `company` are case-insensitive "contains" searches.

The import upserts each good row as a contact, keyed on email, so importing the
same person twice updates one row. Only the email can fail a row (missing or
not an address). A failed row is saved with its row number, reason and raw
cells; every other field is kept as typed.

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
| `src/features/<name>/` | One feature (`auth`, `contacts`, `imports`): HTTP, hooks, UI  |
| `src/shared/`          | Fetch wrapper, error text, `Panel` / `ErrorMessage`, base CSS |

`@/` imports resolve to `src/`.

## Fixtures

Sample CSVs for the import path live in [fixtures/](fixtures/) — one file per
export format, each breaking something different. See
[fixtures/README.md](fixtures/README.md).

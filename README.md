# Smart Contact Import

Ingestion path for arbitrary customer CSV contact exports: infer the column
mapping, confirm it with the user, import in the background, browse the result.

See [SPEC.md](SPEC.md) for scope.

## Requirements

- Docker (Compose v2)
- Node 22+

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
npm run check               # format, lint, test, build
```

Unlike the root `.env`, this one is not optional — Prisma throws on a missing
`DATABASE_URL` rather than falling back. If you changed `DB_PORT` at the root,
change the port in `DATABASE_URL` to match.

### Tests

`npm run check` runs both layers. They differ in what they need:

| Script          | Needs the container? | Covers                                  |
| --------------- | -------------------- | --------------------------------------- |
| `npm run test:unit` | no               | pure functions — no Nest, no database   |
| `npm run test:e2e`  | **yes**          | the real app over HTTP, real Postgres   |

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

`ANTHROPIC_API_KEY` is optional and empty by default; column inference falls
back to a deterministic heuristic without it.

<!-- TODO: prisma migrate + seed commands (data-model slice) -->
<!-- TODO: seeded login credentials (auth slice) -->
<!-- TODO: frontend run instructions (frontend slice) -->

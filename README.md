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

`ANTHROPIC_API_KEY` is optional and empty by default; column inference falls
back to a deterministic heuristic without it.

<!-- TODO: prisma migrate + seed commands (data-model slice) -->
<!-- TODO: seeded login credentials (auth slice) -->
<!-- TODO: frontend run instructions (frontend slice) -->

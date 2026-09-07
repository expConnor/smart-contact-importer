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

No `.env` is required — dev defaults live in `compose.yaml`. Copy
[.env.example](.env.example) to `.env` only to override them (e.g. `DB_PORT`
if you already run Postgres on 5432).

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
npm run check               # format, lint, test, build
```

<!-- TODO: seeded login credentials (auth slice) -->
<!-- TODO: frontend run instructions (frontend slice) -->

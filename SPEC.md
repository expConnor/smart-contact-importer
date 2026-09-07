# Assignment: Smart Contact Import

Customers hand us contact exports from wherever they keep their data — a CRM, a mailing list tool, a form builder, a spreadsheet someone maintains by hand. No two files have the same columns, and asking every customer to reformat their export is not an option.

Build the ingestion path for this. A user uploads a CSV. The system works out how that file's columns correspond to our contact schema, presents its interpretation for confirmation, and then imports the data in the background. Imported contacts are browsable in a filterable, paginated table.

The domain is deliberately trivial. Column inference, idempotency, background processing, and cursor-based pagination are what's being assessed.

---

## Constraints

**Backend** — Node, NestJS, TypeScript strict, Postgres, Prisma.

**LLM** — Any provider, but the repository must run end to end with no API key. Assume the reviewer will not have one.

**Frontend** — Vite, React, TanStack Query, TanStack Table. **Very basic styling.**

**Out of scope** — Redis, S3, signup, multi-user orgs, contact editing, CSV export. Seed a single user. Adding infrastructure beyond Postgres is a decision you would need to justify.

---

## API contract

```
POST /auth/login               → httpOnly JWT cookie
GET  /me
GET  /contacts?cursor=&limit=&status=&company=&sort=
POST /imports                  → Idempotency-Key header + multipart CSV
GET  /imports/:id
POST /imports/:id/mapping
```

`GET /contacts` is cursor-paginated: it takes an opaque `cursor` and a `limit`, and returns `{ items, nextCursor }`, where `nextCursor` is null on the last page. It also filters on `status` and `company`, and sorts on `createdAt`, `name`, `company`, or `jobTitle`. Sort direction is expressed with a leading minus — `sort=company` ascending, `sort=-createdAt` descending, defaulting to `-createdAt`. Changing a filter or sort restarts paging from the beginning.

`POST /imports` returns a job id. `GET /imports/:id` reports where that job is and, once available, the proposed mapping plus enough sample data for a user to judge it. `POST /imports/:id/mapping` accepts the user's confirmed mapping and starts the import.

The mapping payload — proposed by the system, corrected by the user, submitted back:

```json
{
  "headerRowIndex": 3,
  "mappings": [
    {
      "sourceColumn": "E-mail 1 - Value",
      "targetField": "email",
      "confidence": 0.95
    },
    { "sourceColumn": "Given Name", "targetField": "name", "confidence": 0.88 },
    {
      "sourceColumn": "Organization 1 - Title",
      "targetField": "jobTitle",
      "confidence": 0.91
    },
    {
      "sourceColumn": "Phone 1 - Value",
      "targetField": "phone",
      "confidence": 0.72
    },
    { "sourceColumn": "Photo", "targetField": "__ignore__", "confidence": 0.99 }
  ]
}
```

Target fields: `email`, `name`, `company`, `jobTitle`, `phone`, `status`, `__ignore__`. Contacts carry those six fields plus timestamps.

The extra fields exist to make inference non-trivial. `jobTitle` and `company` are adjacent enough that a model will sometimes swap them, and a file with several phone-like columns forces a real choice rather than a lookup.

---

## Required behaviours

**Uploads are idempotent.** The client sends an `Idempotency-Key`. Submitting the same key twice must produce one job and one set of contacts — no duplicate work, no second LLM call. Rows are idempotent too: importing the same contact twice does not create two rows.

**Nothing slow happens in a request.** Upload returns immediately. Column inference and the import itself both run outside the request cycle. The client learns about progress by polling.

**Model output is untrusted.** The model will occasionally return well-formed JSON that is wrong — a column name that isn't in the file, two source columns claiming the same target field, a missing email mapping. Schema validation alone will not catch any of these. Decide what the system does in each case.

**The model is optional.** If the provider is down, rate-limited, or returns garbage, the user must still be able to import their file. An unreliable dependency may degrade the experience; it may not block the core operation.

**The user is the final authority on the mapping.** The system proposes; the user confirms or corrects before a single row is written. Low-confidence guesses should be visibly less trustworthy than high-confidence ones.

**Failure is partial, not total.** A file with three good rows and two bad ones imports three contacts and reports two failures with enough detail to act on. One malformed row does not fail the file.

**Not every field is worth rejecting a row over.** A missing or unparseable `email` makes a row useless, so it fails. A phone number in an unfamiliar format does not — store what you got, or drop that one field, but keep the contact. Decide which fields are fatal and be consistent about it.

**Concurrent workers are safe.** Assume more than one worker process. No job may be claimed twice; a worker that crashes mid-job must not leave that job stranded forever.

**Pagination is cursor-based and stable.** Use keyset (cursor) pagination, not `OFFSET`. Contacts are being inserted by a running import while a user pages through the list, and offset pagination shifts rows underneath them — page 2 silently repeats or skips records. The cursor is opaque to the client, and the sort must be a total order: sorting by `company` alone is ambiguous when two contacts share one, so rows fall through the page boundary.

**Filtering and sorting happen in the database**, never by trimming a page in application code. The `sort` parameter is parsed into a column and a direction, and the column is checked against a fixed allowed set — an unrecognised value is a client error, not a string handed to the query builder.

**Table state is the query.** The frontend table does not sort or filter its own rows. Whatever the user selects becomes the request; the server decides what is on a page.

**Every query is scoped to the authenticated user at the data layer**, not in the UI.

---

## Acceptance fixtures

Commit five CSVs in `fixtures/`. Use real header structures from real export formats, with **synthetic rows — do not commit real contact data.** Each one breaks a different assumption a naive parser makes:

| File                       | The problem                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| `linkedin-connections.csv` | Three lines of preamble before the header row                       |
| `google-contacts.csv`      | ~70 columns, names like `E-mail 1 - Value`, `Organization 1 - Name` |
| `typeform-responses.csv`   | Headers are the literal survey questions                            |
| `excel-de.csv`             | Semicolon-delimited, Windows-1252, `Vorname` / `Nachname`           |
| `clean.csv`                | The happy path                                                      |

All five must import successfully. `headerRowIndex` exists in the mapping payload because of the first one.

---

## Tests

Five tests, chosen for what they prove rather than for coverage:

1. A replayed `Idempotency-Key` produces one job
2. A mapping response referencing a column that isn't in the file is rejected, and the import still proceeds
3. `linkedin-connections.csv` imports without treating its preamble as data
4. A file with three valid and two invalid rows yields three contacts and two recorded errors
5. Paging through contacts sorted by `company`, where many contacts share a company, returns every row exactly once

Tests 2 and 5 matter most. The first demonstrates that model output is handled as input from an untrusted source; the second is where cursor pagination on a non-unique sort column usually falls over.

---

## What's being assessed

In rough order:

- Correctness under retry, concurrency, and partial failure
- Whether unreliable dependencies are isolated rather than trusted
- Whether the boundary between "model proposes" and "system decides" is drawn deliberately
- Scope judgment — what you cut, and whether you cut the right things
- Whether a reviewer can run it

Not assessed: visual design, test coverage percentage, feature count.

If you run short on time, cut scope rather than cutting corners on the behaviours above. An honest, working subset beats a complete but fragile submission.

---

## Deliverable

A repository that runs from a clean clone with no API key and no manual setup beyond documented commands. Credentials in the README.

A README of roughly half a page covering:

- The two or three design decisions you'd defend in review, and what you traded away
- How model output is validated, and what happens when validation fails
- What you cut and why
- What changes at 100x the volume
- Where AI-assisted code was wrong and what you changed

The README is read before the code. It's where a shortcut becomes a decision.

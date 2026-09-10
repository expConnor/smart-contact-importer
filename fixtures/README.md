# Acceptance fixtures

Header structures are copied from real export formats. **Every row is synthetic** —
invented names, and every domain under the reserved `.test` TLD so no address can
resolve to a real mailbox.

| File | Breaks | Delimiter | Encoding | EOL | Cols | Rows |
| --- | --- | --- | --- | --- | --- | --- |
| `clean.csv` | nothing — the happy path | `,` | UTF-8 | LF | 6 | 10 |
| `linkedin-connections.csv` | 3 preamble lines before the header (`headerRowIndex: 3`) | `,` | UTF-8 | CRLF | 7 | 10 |
| `google-contacts.csv` | 73 columns; 10 phone-like columns; `Organization 1 - Name` vs `- Title` | `,` | UTF-8 | LF | 73 | 8 |
| `typeform-responses.csv` | headers are literal survey questions, one containing a comma | `,` | UTF-8 | LF | 12 | 6 |
| `excel-de.csv` | semicolons, Windows-1252, `Vorname`/`Nachname`, German status vocabulary | `;` | cp1252 | CRLF | 8 | 10 |
| `partial-rows.csv` | 3 valid rows, 2 fatal — SPEC test 4 | `,` | UTF-8 | LF | 6 | 5 |

## What each one is for

| File | The specific trap |
| --- | --- |
| `linkedin-connections.csv` | A parser that assumes row 0 is the header imports `Notes:` as a contact. Two rows have no email — LinkedIn only exports it for connections who opted in, which is what the preamble warns about |
| `google-contacts.csv` | `Phone 1..5 - Value` forces a choice, not a lookup. `Organization 1 - Name` and `Organization 1 - Title` are the pair a model swaps. Most cells are empty, as in a real export |
| `typeform-responses.csv` | No column name resembles a field name. `If you had to pick one, what's your role there?` puts a comma inside the header row, so the header only parses under correct quoting |
| `excel-de.csv` | Read as UTF-8 it fails at byte 68. Read as comma-delimited it is one column. `Kunde` / `Interessent` / `Ehemaliger Kunde` are the customer's vocabulary, not ours |
| `partial-rows.csv` | Both failures are the fatal field (one email absent, one unparseable). Both surviving rows carry a broken *non-fatal* field — `ext. 4471` and an empty phone — so the fatal/tolerated line is observable |

## Byte-level invariants

`.gitattributes` sets `fixtures/** -text`. Without it a clone with `core.autocrlf`
rewrites the two CRLF files and the encoding tests pass for the wrong reason.

```bash
file fixtures/excel-de.csv     # ISO-8859 text, with CRLF line terminators — must NOT say UTF-8
```

## Sources for the header structures

| Format | Source |
| --- | --- |
| LinkedIn | [Connections.csv in the wild](https://raw.githubusercontent.com/mstatt/LinkedIn-Network-Visualizer/main/Connections.csv) — preamble text is verbatim |
| Google | [Google CSV round-trip format](https://www.timeatlas.com/wp-content/uploads/sample-google-contacts-import.csv) |
| Typeform | [Working with your responses](https://help.typeform.com/hc/en-us/articles/360029253732-Working-with-your-responses) — `#` leads, `Response Type` / `Start Date (UTC)` / `Submit Date (UTC)` / `Network ID` trail |
| Excel DE | [German Outlook CSV columns](https://support.microsoft.com/de-de/office/erstellen-oder-bearbeiten-von-csv-dateien-zum-importieren-in-outlook-4518d70d-8fe9-46ad-94fa-1494247193c7) |

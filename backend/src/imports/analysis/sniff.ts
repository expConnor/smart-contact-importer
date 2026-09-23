import { createReadStream } from 'node:fs';
import iconv from 'iconv-lite';
import Papa from 'papaparse';
import type { SourceEncoding } from './decode';

export type SniffedFile = {
  delimiter: string;
  headerRowIndex: number;
  headers: string[];
  sampleRows: string[][];
};

const HEAD_CHARS = 64 * 1024;
const PREVIEW_ROWS = 20;
const SAMPLE_ROWS = 5;
const SAMPLE_CELL_CHARS = 80;

const NUMERIC = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Delimiter, header row and sample rows, from the head of a decoded file.
 *
 * Total: an empty or unparseable file yields `headerRowIndex: -1` and no
 * headers rather than throwing. The caller decides that is a failed job.
 */
export function sniff(text: string): SniffedFile {
  const head = text.slice(0, HEAD_CHARS);

  const parsed = Papa.parse<string[]>(head, {
    // '' is Papa's "guess it"
    delimiter: '',
    skipEmptyLines: false,
    header: false,
    dynamicTyping: false,
    preview: PREVIEW_ROWS,
  });

  const rows =
    head.length < text.length ? parsed.data.slice(0, -1) : parsed.data;
  const headerRowIndex = locateHeader(rows);

  return {
    delimiter: parsed.meta.delimiter,
    headerRowIndex,
    headers: rows[headerRowIndex] ?? [],
    sampleRows: rows
      .slice(headerRowIndex + 1)
      .filter((row) => !isBlank(row))
      .slice(0, SAMPLE_ROWS)
      .map((row) => row.map(truncate)),
  };
}

/**
 * Rows off disk one at a time, decoded with the label analysis stored.
 *
 * The error forwarding is not decoration: `.pipe()` does not propagate errors,
 * so without it an ENOENT on the read stream leaves this iterator hanging
 * forever — and a hung handler holds its lease until the attempt budget burns.
 */
export async function* rowStream(
  path: string,
  encoding: SourceEncoding,
  delimiter: string,
): AsyncGenerator<string[]> {
  const file = createReadStream(path);
  const decoded = file.pipe(iconv.decodeStream(encoding));
  const rows = decoded.pipe(
    Papa.parse(Papa.NODE_STREAM_INPUT, {
      delimiter,
      skipEmptyLines: false,
      header: false,
      dynamicTyping: false,
    }),
  );

  const forwardError = (error: Error) => rows.destroy(error);
  file.on('error', forwardError);
  decoded.on('error', forwardError);

  yield* rows as AsyncIterable<string[]>;
}

/**
 * Rows below the header, blanks excluded — `totalRows` as fixtures/README counts it.
 *
 * Indexes on the same `skipEmptyLines: false` basis `sniff` used, so
 * `headerRowIndex` means here what it meant there. Counting with blanks
 * dropped renumbers linkedin-connections.csv and is quietly wrong by one.
 */
export async function countDataRows(
  path: string,
  encoding: SourceEncoding,
  delimiter: string,
  headerRowIndex: number,
): Promise<number> {
  let index = -1;
  let count = 0;

  for await (const row of rowStream(path, encoding, delimiter)) {
    index += 1;
    if (index > headerRowIndex && !isBlank(row)) count += 1;
  }

  return count;
}

/**
 * The first row that looks like a header, measured against the modal width.
 *
 * -1 when there are no rows at all.
 */
function locateHeader(rows: string[][]): number {
  const width = modalWidth(rows);
  const atWidth = (row: string[]) => row.length === width;

  const strict = rows.findIndex((row) => atWidth(row) && looksLikeHeader(row));

  return strict === -1 ? rows.findIndex(atWidth) : strict;
}

function modalWidth(rows: string[][]): number {
  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
  }

  let best = 0;
  let bestCount = 0;
  for (const [width, count] of counts) {
    if (count > bestCount || (count === bestCount && width > best)) {
      best = width;
      bestCount = count;
    }
  }
  return best;
}

function looksLikeHeader(row: string[]): boolean {
  const cells = row.map((cell) => cell.trim());

  if (cells.some((cell) => cell === '')) return false;
  if (new Set(cells.map((cell) => cell.toLowerCase())).size !== cells.length) {
    return false;
  }
  return !cells.every((cell) => NUMERIC.test(cell));
}

function isBlank(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

function truncate(cell: string): string {
  return cell.length <= SAMPLE_CELL_CHARS
    ? cell
    : `${cell.slice(0, SAMPLE_CELL_CHARS)}…`;
}

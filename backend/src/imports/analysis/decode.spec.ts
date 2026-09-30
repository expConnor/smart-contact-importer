import { decode } from './decode';
import { csvFixture } from '../../test/builders/upload.builder';

// Every fixture except excel-de.csv. Listed rather than globbed: a glob that
// silently matched nothing would leave this suite green with no cases in it.
const UTF8_FIXTURES = [
  'clean.csv',
  'linkedin-connections.csv',
  'google-contacts.csv',
  'typeform-responses.csv',
  'partial-rows.csv',
  'excel-fr.csv',
];

// excel-fr.csv carries a BOM, but a UTF-8 one over valid UTF-8. The
// windows-1252 case below needs a BOM no real export would write, so a
// handcrafted buffer is the honest choice. Byte literals rather than `iconv.encode()`: a test that
// encodes with the library it is testing agrees with itself either way.
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const CP1252_MULLER = Buffer.from([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]);

describe('decode', () => {
  // Bytes from the real fixture, not a handcrafted buffer: the point of the
  // fallback is that a file someone actually exported from German Excel
  // survives it, and a buffer we encoded ourselves would only prove we can
  // encode.
  it('falls back to windows-1252 when the bytes are not valid UTF-8', () => {
    const result = decode(csvFixture('excel-de.csv').body);

    expect(result.encoding).toBe('windows-1252');

    expect(result.text).toContain('Müller');
  });

  // The other half of the previous test. That one proves the fallback fires
  // when it must; these prove it stays out of the way when it must not — a
  // decoder that reached for win1252 on the first byte over 0x7F, or that
  // simply defaulted to it, would still pass excel-de.csv and mislabel all six.
  it.each(UTF8_FIXTURES)('reports %s as utf-8', (name) => {
    expect(decode(csvFixture(name).body).encoding).toBe('utf-8');
  });

  // Most fixtures above are pure ASCII, where both codecs agree byte for byte
  // and only the label distinguishes them. This is the case where they
  // genuinely disagree: read as win1252, these two bytes are `Ã¼`, so the
  // assertion on `text` fails rather than the assertion on `encoding`.
  it('decodes multi-byte UTF-8 rather than falling back', () => {
    const result = decode(Buffer.from('Nachname\nMüller\n', 'utf-8'));

    expect(result.encoding).toBe('utf-8');
    expect(result.text).toContain('Müller');
  });

  it('strips the BOM from a UTF-8 file', () => {
    const bytes = Buffer.concat([
      UTF8_BOM,
      Buffer.from('Name\nAda\n', 'utf-8'),
    ]);

    // Whole-result equality: a surviving U+FEFF fails here, where `toContain`
    // would pass with the BOM still glued to the first cell.
    expect(decode(bytes)).toEqual({ text: 'Name\nAda\n', encoding: 'utf-8' });
  });

  // Excel's "CSV UTF-8" save. A surviving U+FEFF would glue itself to the
  // first header, which then matches nothing.
  it('strips the BOM Excel writes on a CSV UTF-8 save', () => {
    const result = decode(csvFixture('excel-fr.csv').body);

    expect(result.text.startsWith('Civilité;Prénom;Nom;')).toBe(true);
  });

  it('strips the BOM before falling back to windows-1252', () => {
    const bytes = Buffer.concat([UTF8_BOM, CP1252_MULLER]);

    // The branch TextDecoder never reaches, and so never cleans up after:
    // iconv reads the three BOM bytes as `ï»¿` and prepends them.
    expect(decode(bytes)).toEqual({ text: 'Müller', encoding: 'windows-1252' });
  });
});

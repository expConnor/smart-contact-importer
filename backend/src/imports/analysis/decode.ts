import iconv from 'iconv-lite';

export type SourceEncoding = 'utf-8' | 'windows-1252';
export type DecodedFile = { text: string; encoding: SourceEncoding };

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function stripBom(bytes: Buffer): Buffer {
  return bytes.subarray(0, 3).equals(UTF8_BOM) ? bytes.subarray(3) : bytes;
}

export function decode(input: Buffer): DecodedFile {
  const bytes = stripBom(input);

  try {
    const utf8Text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: utf8Text, encoding: 'utf-8' };
  } catch {
    return { text: iconv.decode(bytes, 'win1252'), encoding: 'windows-1252' };
  }
}

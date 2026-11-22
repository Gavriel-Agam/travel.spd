// Smart import from files: spreadsheets (Excel, CSV, Google Sheets exports) and
// documents (Word, Google Docs exports, plain text) are read on this device,
// offline too, and turned into plain text for the existing Smart import
// pipeline (smart-parse-expenses). Nothing is uploaded until Read is tapped,
// and then only the text, exactly like pasted text.
// The parsers (SheetJS, mammoth) load the first time a file is picked.

export type ImportFileKind = 'sheet' | 'doc' | 'legacyDoc' | 'text';

/** What the file picker offers. */
export const IMPORT_FILE_ACCEPT = [
  '.xlsx', '.xls', '.xlsm', '.ods', '.csv', '.tsv',
  '.docx', '.doc', '.odt', '.rtf', '.txt',
  'text/csv', 'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
].join(',');

/** Bigger files are refused before reading (a statement or itinerary is far smaller). */
export const IMPORT_FILE_MAX_BYTES = 10 * 1024 * 1024;

export function fileKind(name: string, mime = ''): ImportFileKind | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['xlsx', 'xls', 'xlsm', 'ods', 'csv', 'tsv'].includes(ext)) return 'sheet';
  if (ext === 'docx') return 'doc';
  if (ext === 'doc' || ext === 'odt' || ext === 'rtf') return 'legacyDoc';
  if (ext === 'txt' || mime.startsWith('text/')) return 'text';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'sheet';
  if (mime.includes('wordprocessingml')) return 'doc';
  if (mime === 'application/msword') return 'legacyDoc';
  return null;
}

/** Trims every line, drops empty ones and squeezes runs of spaces. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[\t  ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Spreadsheet rows as text: one line per row, cells joined by " | ", empty
 * rows and empty trailing cells left out. Each sheet of a workbook with more
 * than one gets a "# name" line.
 */
export function sheetsToText(sheets: { name: string; rows: unknown[][] }[]): string {
  const withRows = sheets
    .map((s) => ({
      name: s.name,
      lines: s.rows
        .map((r) => {
          const cells = r.map((v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim()));
          while (cells.length && !cells[cells.length - 1]) cells.pop();
          return cells.join(' | ');
        })
        .filter((l) => l.replace(/[|\s]/g, '') !== ''),
    }))
    .filter((s) => s.lines.length);
  if (withRows.length === 1) return withRows[0].lines.join('\n');
  return withRows.map((s) => [`# ${s.name}`, ...s.lines].join('\n')).join('\n\n');
}

/**
 * Splits text that is over the limit into parts of whole lines (a line longer
 * than the limit is cut). With `repeatHeader`, the first line (a table's
 * column names) starts every part, so each part still makes sense alone.
 */
export function splitIntoParts(text: string, max: number, repeatHeader = false): string[] {
  if (text.length <= max) return [text];
  const lines = text.split('\n');
  const header = repeatHeader && lines.length > 1 && lines[0].length < max / 4 ? lines.shift()! : null;
  const parts: string[] = [];
  let cur: string[] = header ? [header] : [];
  let len = header ? header.length : 0;
  const flush = () => {
    if (cur.length > (header ? 1 : 0)) parts.push(cur.join('\n'));
    cur = header ? [header] : [];
    len = header ? header.length : 0;
  };
  for (let line of lines) {
    while (line.length) {
      const room = max - len - (cur.length ? 1 : 0);
      if (line.length <= room) {
        cur.push(line);
        len += line.length + (cur.length > 1 ? 1 : 0);
        line = '';
      } else if (cur.length > (header ? 1 : 0)) {
        flush();
      } else {
        // One line bigger than a whole part: cut it
        cur.push(line.slice(0, room));
        line = line.slice(room);
        flush();
      }
    }
  }
  flush();
  return parts;
}

/**
 * Text from an old binary Word file (.doc): the readable runs of its
 * WordDocument stream (Hebrew and other non-Latin text is stored as UTF-16).
 * Best effort; layout and some symbols are lost, which Smart import copes with.
 */
/** Characters a travel document is written in (Latin, Greek, Cyrillic, Hebrew, Arabic, punctuation, currency signs). Random binary data rarely stays inside these for long. */
function readableCode(code: number) {
  return (
    (code >= 0x20 && code < 0x7f) ||
    (code >= 0xa0 && code < 0x250) ||
    (code >= 0x370 && code < 0x530) ||
    (code >= 0x5b0 && code < 0x700) ||
    (code >= 0x2010 && code < 0x2070) ||
    (code >= 0x20a0 && code < 0x20d0)
  );
}

export function legacyDocText(bytes: Uint8Array): string {
  const runs: string[] = [];
  // UTF-16LE runs of letters, digits, punctuation and spaces
  let cur = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (code === 13 || code === 11) {
      cur += '\n';
    } else if (readableCode(code)) {
      cur += String.fromCharCode(code);
    } else {
      if (cur.replace(/\s/g, '').length >= 3) runs.push(cur);
      cur = '';
    }
  }
  if (cur.replace(/\s/g, '').length >= 3) runs.push(cur);
  const utf16 = runs.join('\n');
  // Files saved with 8-bit text: Latin runs instead
  const latin = (new TextDecoder('latin1').decode(bytes).match(/[\x20-\x7E\r]{4,}/g) ?? []).join('\n');
  const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
  return normalizeText(letters(utf16) >= letters(latin) / 2 ? utf16 : latin);
}

export type ReadFileResult = { text: string; kind: ImportFileKind };

/** Reads a picked file into plain text, on this device. Throws 'file_unsupported' / 'file_too_big' / 'file_empty' / 'file_unreadable'. */
export async function readImportFile(file: Blob & { name?: string }): Promise<ReadFileResult> {
  const name = file.name ?? '';
  const kind = fileKind(name, file.type);
  if (!kind) throw new Error('file_unsupported');
  if (file.size > IMPORT_FILE_MAX_BYTES) throw new Error('file_too_big');
  let text = '';
  try {
    if (kind === 'text') {
      text = normalizeText(await file.text());
    } else if (kind === 'sheet') {
      const XLSX = await import('xlsx');
      const book = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true, dense: true });
      const sheets = book.SheetNames.map((n) => ({
        name: n,
        rows: XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false }),
      }));
      text = sheetsToText(sheets);
    } else if (kind === 'doc') {
      const mammoth = await import('mammoth');
      const data = await file.arrayBuffer();
      // The browser build reads `arrayBuffer`, the Node build (tests) reads `buffer`
      const out = await mammoth.extractRawText({ arrayBuffer: data, buffer: data } as { arrayBuffer: ArrayBuffer });
      text = normalizeText(out.value);
    } else {
      text = await readLegacyDoc(name, new Uint8Array(await file.arrayBuffer()));
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('file_')) throw e;
    throw new Error('file_unreadable');
  }
  if (!text.trim()) throw new Error('file_empty');
  return { text, kind };
}

/** .doc (inside its container), .odt (through SheetJS's reader) and .rtf (text between the codes). */
async function readLegacyDoc(name: string, bytes: Uint8Array): Promise<string> {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'rtf') {
    const raw = new TextDecoder('latin1').decode(bytes);
    return normalizeText(
      raw
        .replace(/\\'([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\u(-?\d+)\??/g, (_m, n) => String.fromCharCode((Number(n) + 65536) % 65536))
        .replace(/\\par[d]?/g, '\n')
        .replace(/\{\\\*[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, ''),
    );
  }
  const XLSX = await import('xlsx');
  if (ext === 'odt') {
    // An .odt is a zip with content.xml: its paragraphs are the text
    const zip = XLSX.CFB.read(bytes, { type: 'array' });
    const entry = XLSX.CFB.find(zip, 'content.xml');
    const xml = entry?.content ? new TextDecoder().decode(entry.content as Uint8Array) : '';
    return normalizeText(xml.replace(/<\/text:(p|h)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  }
  const cfb = XLSX.CFB.read(bytes, { type: 'array' });
  const stream = XLSX.CFB.find(cfb, 'WordDocument');
  const data = stream?.content ? new Uint8Array(stream.content as ArrayLike<number>) : bytes;
  return legacyDocText(data);
}

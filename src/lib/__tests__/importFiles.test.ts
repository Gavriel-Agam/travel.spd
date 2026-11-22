import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { fileKind, legacyDocText, normalizeText, readImportFile, sheetsToText, splitIntoParts } from '../importFiles';

describe('fileKind', () => {
  it('knows spreadsheets, documents and text by extension or type', () => {
    expect(fileKind('Trip.XLSX')).toBe('sheet');
    expect(fileKind('old.xls')).toBe('sheet');
    expect(fileKind('export.csv')).toBe('sheet');
    expect(fileKind('notes.docx')).toBe('doc');
    expect(fileKind('notes.doc')).toBe('legacyDoc');
    expect(fileKind('a.txt')).toBe('text');
    expect(fileKind('noext', 'text/plain')).toBe('text');
    expect(fileKind('photo.png', 'image/png')).toBeNull();
  });
});

describe('normalizeText', () => {
  it('trims lines, drops blank ones and squeezes spaces', () => {
    expect(normalizeText('  a\t\tb \r\n\r\n c  \n')).toBe('a b\nc');
  });
});

describe('sheetsToText', () => {
  it('joins cells, skips empty rows and trailing cells', () => {
    expect(sheetsToText([{ name: 'S', rows: [['Date', 'Item', 'Amount', ''], ['', '', ''], ['1/5', 'Taxi', 350]] }])).toBe('Date | Item | Amount\n1/5 | Taxi | 350');
  });
  it('labels each sheet when there are several', () => {
    const out = sheetsToText([
      { name: 'Hotel', rows: [['Night', 100]] },
      { name: 'Empty', rows: [['']] },
      { name: 'Food', rows: [['Pad thai', 80]] },
    ]);
    expect(out).toBe('# Hotel\nNight | 100\n\n# Food\nPad thai | 80');
  });
});

describe('splitIntoParts', () => {
  it('keeps short text whole', () => {
    expect(splitIntoParts('abc', 10)).toEqual(['abc']);
  });
  it('splits on whole lines, never over the limit', () => {
    const text = Array.from({ length: 50 }, (_, i) => `row ${i} taxi 100`).join('\n');
    const parts = splitIntoParts(text, 120);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(120);
    expect(parts.join('\n')).toBe(text);
  });
  it('repeats a table header on every part', () => {
    const text = ['Date | Item | Amount', ...Array.from({ length: 30 }, (_, i) => `1/${i} | Item ${i} | ${i}0`)].join('\n');
    const parts = splitIntoParts(text, 100, true);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.startsWith('Date | Item | Amount\n')).toBe(true);
      expect(p.length).toBeLessThanOrEqual(100);
    }
  });
  it('cuts a single line longer than a part', () => {
    const parts = splitIntoParts('x'.repeat(250), 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
  });
});

describe('legacyDocText', () => {
  it('finds UTF-16 Hebrew and English text between binary noise', () => {
    const enc = (s: string) => {
      const out = new Uint8Array(s.length * 2);
      for (let i = 0; i < s.length; i++) {
        out[i * 2] = s.charCodeAt(i) & 0xff;
        out[i * 2 + 1] = s.charCodeAt(i) >> 8;
      }
      return out;
    };
    const noise = new Uint8Array([0, 0, 1, 2, 0xff, 0xfe, 3, 0]);
    const bytes = new Uint8Array([...noise, ...enc('מונית 350 באט\rDinner 1200 THB'), ...noise]);
    const text = legacyDocText(bytes);
    expect(text).toContain('מונית 350 באט');
    expect(text).toContain('Dinner 1200 THB');
  });
});

describe('readImportFile', () => {
  it('reads an Excel workbook on the device', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Date', 'What', 'Amount'], ['2026-11-01', 'Taxi', 350]]), 'Trip');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = new File([bytes], 'trip.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const out = await readImportFile(file);
    expect(out.kind).toBe('sheet');
    expect(out.text).toBe('Date | What | Amount\n2026-11-01 | Taxi | 350');
  });
  it('reads a Word document (.docx)', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      '_rels/.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>מלון 3 לילות 9,000 באט</w:t></w:r></w:p><w:p><w:r><w:t>Taxi 350</w:t></w:r></w:p></w:body></w:document>',
    );
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const out = await readImportFile(new File([bytes], 'plan.docx'));
    expect(out.kind).toBe('doc');
    expect(out.text).toBe('מלון 3 לילות 9,000 באט\nTaxi 350');
  });
  it('reads CSV and plain text', async () => {
    expect((await readImportFile(new File(['a,b\n1,2\n'], 'x.csv', { type: 'text/csv' }))).text).toBe('a | b\n1 | 2');
    expect((await readImportFile(new File(['  hello  \n\n world '], 'x.txt', { type: 'text/plain' }))).text).toBe('hello\nworld');
  });
  it('refuses unsupported, empty and huge files', async () => {
    await expect(readImportFile(new File(['x'], 'x.png', { type: 'image/png' }))).rejects.toThrow('file_unsupported');
    await expect(readImportFile(new File(['   '], 'x.txt'))).rejects.toThrow('file_empty');
    const big = { name: 'x.txt', type: 'text/plain', size: 11 * 1024 * 1024 } as unknown as File;
    await expect(readImportFile(big)).rejects.toThrow('file_too_big');
  });
});

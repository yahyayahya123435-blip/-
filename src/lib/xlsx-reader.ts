/**
 * SERVER-ONLY. A minimal, read-only XLSX cell reader.
 *
 * Why not exceljs (which this project already depends on for *writing*
 * reports)? The association's register — resources/seed/families-330.xlsx —
 * declares the spreadsheet namespace with an `x:` prefix
 * (`<x:workbook><x:sheets><x:sheet .../>`). exceljs's parser matches tag
 * names literally, so it reads that workbook as having zero sheets and then
 * throws. Re-saving the file through exceljs would fix the parse but would
 * also mean shipping a re-encoded copy of the document the association
 * handed over, which is exactly the artifact we want to keep verbatim.
 *
 * So: read the original file as-is with a parser that ignores namespace
 * prefixes. Scope is deliberately tiny — worksheet cell values as text, which
 * is all the import needs. It does not handle styles, dates, formulas
 * (returns the cached result), merged cells, or writing.
 */
import unzipper from 'unzipper';

const XML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

function decodeXmlText(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

/** Strips any namespace prefix: "x:sheet" -> "sheet". */
function localName(tagName: string): string {
  const colon = tagName.indexOf(':');
  return colon === -1 ? tagName : tagName.slice(colon + 1);
}

/** Concatenates the text of every <t> element inside a fragment. */
function collectTextElements(fragment: string): string {
  let out = '';
  const pattern = /<(?:[\w.-]+:)?t\b[^>]*?(\/)?>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fragment)) !== null) {
    if (match[1]) continue; // self-closing <t/> — empty
    const contentStart = match.index + match[0].length;
    const closeIndex = fragment.indexOf('</', contentStart);
    if (closeIndex === -1) break;
    out += decodeXmlText(fragment.slice(contentStart, closeIndex));
    pattern.lastIndex = closeIndex;
  }
  return out;
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([\w.:-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    attrs[localName(match[1])] = decodeXmlText(match[2]);
  }
  return attrs;
}

/** "BC12" -> 55 (1-based column index). */
export function columnIndexFromRef(ref: string): number {
  let index = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break; // stop at the row digits
    index = index * 26 + (code - 64);
  }
  return index;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const pattern = /<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    strings.push(collectTextElements(match[1]));
  }
  return strings;
}

export interface XlsxSheet {
  name: string;
  /** rows[rowNumber][columnNumber] — both 1-based; holes are undefined. */
  rows: (string | undefined)[][];
  rowCount: number;
}

function parseSheet(xml: string, sharedStrings: string[]): (string | undefined)[][] {
  const rows: (string | undefined)[][] = [];
  let rowNumber = 0;

  const rowPattern = /<(?:[\w.-]+:)?row\b([^>]*?)(\/?)>([\s\S]*?)(?:<\/(?:[\w.-]+:)?row>|$)/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const rowAttrs = parseAttributes(rowMatch[1]);
    // Honour an explicit r="" so skipped (empty) rows keep their numbering.
    rowNumber = rowAttrs.r ? Number(rowAttrs.r) : rowNumber + 1;
    if (rowMatch[2]) continue; // self-closing <row/>

    const cells: (string | undefined)[] = [];
    const cellPattern = /<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g;
    let cellMatch: RegExpExecArray | null;
    let columnNumber = 0;
    while ((cellMatch = cellPattern.exec(rowMatch[3])) !== null) {
      const attrs = parseAttributes(cellMatch[1]);
      columnNumber = attrs.r ? columnIndexFromRef(attrs.r) : columnNumber + 1;
      const body = cellMatch[2] ?? '';

      let value: string;
      if (attrs.t === 's') {
        // Shared string: <v> holds an index into sharedStrings.
        const index = Number(collectValueElement(body));
        value = Number.isInteger(index) ? (sharedStrings[index] ?? '') : '';
      } else if (attrs.t === 'inlineStr') {
        value = collectTextElements(body);
      } else {
        // Numbers, booleans, and formula cells (whose <v> is the cached result).
        value = collectValueElement(body);
      }
      cells[columnNumber] = value;
    }
    rows[rowNumber] = cells;
  }

  return rows;
}

function collectValueElement(fragment: string): string {
  const match = /<(?:[\w.-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v>/.exec(fragment);
  return match ? decodeXmlText(match[1]).trim() : '';
}

/**
 * Reads one worksheet (default: the first) into rows of plain text.
 * Sheet order follows the workbook's declared order, not zip entry order.
 */
export async function readXlsxSheet(filePath: string, sheetIndex = 0): Promise<XlsxSheet> {
  const directory = await unzipper.Open.file(filePath);
  const entries = new Map(directory.files.map((f) => [f.path.replace(/^\//, ''), f]));

  const readEntry = async (path: string): Promise<string | null> => {
    const entry = entries.get(path);
    if (!entry) return null;
    return (await entry.buffer()).toString('utf-8');
  };

  const workbookXml = await readEntry('xl/workbook.xml');
  if (!workbookXml) {
    throw new Error('XLSX_INVALID: xl/workbook.xml is missing');
  }

  const sheetTags = [...workbookXml.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*?)\/?>/g)]
    .map((m) => parseAttributes(m[1]))
    .filter((attrs) => attrs.name !== undefined);
  const target = sheetTags[sheetIndex];
  if (!target) {
    throw new Error(`XLSX_INVALID: workbook has no sheet at index ${sheetIndex}`);
  }

  // Map the sheet's relationship id to its part name.
  const relsXml = (await readEntry('xl/_rels/workbook.xml.rels')) ?? '';
  const rels = new Map(
    [...relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)]
      .map((m) => parseAttributes(m[1]))
      .map((attrs) => [attrs.Id ?? attrs.id, attrs.Target ?? attrs.target] as const),
  );

  const relTarget = target.id ? rels.get(target.id) : undefined;
  const sheetPath = relTarget
    ? relTarget.replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/')
    : `xl/worksheets/sheet${sheetIndex + 1}.xml`;

  const sheetXml = await readEntry(sheetPath);
  if (!sheetXml) {
    throw new Error(`XLSX_INVALID: worksheet part "${sheetPath}" is missing`);
  }

  const sharedStrings = parseSharedStrings((await readEntry('xl/sharedStrings.xml')) ?? '');
  const rows = parseSheet(sheetXml, sharedStrings);

  return { name: target.name, rows, rowCount: rows.length ? rows.length - 1 : 0 };
}

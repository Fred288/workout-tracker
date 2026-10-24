/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  // Drop completely empty lines (a lone empty field).
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

/** Rows as objects keyed by the header row. */
export function csvToObjects(text: string): { header: string[]; rows: Record<string, string>[] } {
  const [header = [], ...body] = parseCsv(text);
  return {
    header,
    rows: body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))),
  };
}

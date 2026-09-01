/**
 * Minimal, correct CSV serialization — RFC 4180 quoting (a field containing
 * a comma, double-quote, or newline is wrapped in quotes with internal
 * quotes doubled), UTF-8 with a leading BOM so Excel opens
 * Polish/Ukrainian/Russian names correctly instead of mis-decoding them
 * (see docs/PRODUCT_BIBLE.md Financial Reports §28). No third-party CSV
 * library needed for output this simple.
 */
function escapeCsvField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

import PDFDocument from "pdfkit";
import { Response } from "express";

function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Quote if the cell contains a comma, quote or newline; double up inner quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize flat objects to a CSV string (RFC 4180 quoting). */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(",")),
  ];
  return lines.join("\n");
}

/** Stream an array of flat objects to the client as a CSV download. */
export function sendCsv(res: Response, rows: Record<string, unknown>[], filename: string) {
  res.header("Content-Type", "text/csv");
  res.attachment(filename.endsWith(".csv") ? filename : `${filename}.csv`);
  res.send(toCsv(rows));
}

interface PdfTableOptions {
  title: string;
  columns: { key: string; label: string; width?: number }[];
  rows: Record<string, unknown>[];
  subtitle?: string;
}

/** Render a simple tabular PDF report and stream it to the client. */
export function sendPdfTable(res: Response, filename: string, opts: PdfTableOptions) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.header("Content-Type", "application/pdf");
  res.attachment(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  doc.pipe(res);

  doc.fontSize(18).text(opts.title, { align: "left" });
  if (opts.subtitle) doc.moveDown(0.2).fontSize(10).fillColor("#666").text(opts.subtitle);
  doc.moveDown(1).fillColor("#000");

  const startX = doc.x;
  let y = doc.y;
  const colWidth = (c: { width?: number }) => c.width ?? 515 / opts.columns.length;

  // header row
  doc.fontSize(10).font("Helvetica-Bold");
  let x = startX;
  for (const col of opts.columns) {
    doc.text(col.label, x, y, { width: colWidth(col) });
    x += colWidth(col);
  }
  y += 18;
  doc.moveTo(startX, y - 4).lineTo(555, y - 4).strokeColor("#ccc").stroke();

  // data rows
  doc.font("Helvetica");
  for (const row of opts.rows) {
    x = startX;
    for (const col of opts.columns) {
      doc.text(String(row[col.key] ?? ""), x, y, { width: colWidth(col) });
      x += colWidth(col);
    }
    y += 16;
    if (y > 780) {
      doc.addPage();
      y = doc.y;
    }
  }

  doc.end();
}

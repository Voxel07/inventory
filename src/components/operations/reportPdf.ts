import type { Translator } from '../../utils/naming';
import { formatDateTime, formatReportValue } from '../../utils/dateFormat';

export interface ReportPdfOptions {
  title: string;
  definition?: string;
  generatedAt: number;
  stale: boolean;
  /** Human-readable active filters, e.g. "Item: Generator". */
  filters: string[];
  rows: Record<string, unknown>[];
  heading: (key: string) => string;
  t: Translator;
}

/**
 * One filtered report generation as a landscape A4 table. Rows come from the same generation-checked export
 * as the CSV, so the PDF never mixes report builds.
 */
export async function reportPdf({ title, definition, generatedAt, stale, filters, rows, heading, t }: ReportPdfOptions): Promise<Blob> {
  // Loaded on demand so jspdf stays out of the route bundle.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const bottom = pageHeight - margin - 4; // keeps clear of the footer
  const lineHeight = 3.6;
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((key) => key !== 'id' && !key.endsWith('Id'));
  const columnWidth = keys.length ? (pageWidth - 2 * margin) / keys.length : pageWidth - 2 * margin;
  let y = margin;
  let tableStarted = false;

  const header = () => {
    doc.setFont('helvetica', 'bold').setFontSize(8);
    const cells = keys.map((key) => doc.splitTextToSize(heading(key), columnWidth - 2) as string[]);
    const height = Math.max(1, ...cells.map((cell) => cell.length)) * lineHeight + 1.5;
    doc.setFillColor(235, 235, 235).rect(margin, y - 3, pageWidth - 2 * margin, height, 'F');
    cells.forEach((cell, index) => doc.text(cell, margin + index * columnWidth + 1, y));
    y += height;
    doc.setFont('helvetica', 'normal').setFontSize(7.5);
  };
  /** New page; inside the table the column header repeats. */
  const nextPage = () => {
    doc.addPage();
    y = margin + 3;
    if (tableStarted) header();
  };

  doc.setFont('helvetica', 'bold').setFontSize(14).text(title, margin, y + 2);
  y += 8;
  doc.setFont('helvetica', 'normal').setFontSize(9);
  const meta = [
    `${t('operations.reportPdf.generated')}: ${formatDateTime(generatedAt)}${stale ? ` · ${t('operations.reportPdf.staleSourceRecordsChanged')}` : ''}`,
    `${t('common.filters')}: ${filters.length ? filters.join(' · ') : t('operations.reportPdf.none')}`,
    `${t('operations.reportPdf.rows')}: ${rows.length}`,
    ...(definition ? [definition] : []),
  ];
  // Long filter lists and definitions wrap and continue on the next page line by line.
  for (const line of meta.flatMap((entry) => doc.splitTextToSize(entry, pageWidth - 2 * margin) as string[])) {
    if (y + 4 > bottom) nextPage();
    doc.text(line, margin, y);
    y += 4;
  }
  y += 3;

  if (!rows.length) {
    if (y + 4 > bottom) nextPage();
    doc.text(t('operations.reportPdf.noMatchingRecords'), margin, y);
  } else {
    // The header needs room for itself and at least one row line.
    if (y + 2 * lineHeight + 6 > bottom) nextPage();
    tableStarted = true;
    header();
    for (const row of rows) {
      const cells = keys.map((key) => doc.splitTextToSize(formatReportValue(key, row[key]), columnWidth - 2) as string[]);
      const lines = Math.max(1, ...cells.map((cell) => cell.length));
      // Keep short rows together; a row taller than a page is split across pages line by line.
      if (y + lines * lineHeight > bottom && lines * lineHeight <= bottom - margin - 12) nextPage();
      for (let offset = 0; offset < lines;) {
        const room = Math.max(1, Math.floor((bottom - y) / lineHeight));
        const take = Math.min(room, lines - offset);
        cells.forEach((cell, index) => {
          const part = cell.slice(offset, offset + take);
          if (part.length) doc.text(part, margin + index * columnWidth + 1, y);
        });
        offset += take;
        y += take * lineHeight;
        if (offset < lines) nextPage();
      }
      doc.setDrawColor(220, 220, 220).line(margin, y - 2.4, pageWidth - margin, y - 2.4);
      y += 1;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFontSize(7).setTextColor(120);
    doc.text(`${title} · ${formatDateTime(generatedAt)} · ${page}/${pages}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
  }
  return doc.output('blob');
}

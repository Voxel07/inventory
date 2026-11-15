export interface PrintTableOptions {
  title: string;
  subtitle: string;
  description: string;
  summary?: string;
  language: string;
  columns: string[];
  rows: string[][];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

/** Print a complete table independently of the app's navigation, theme and responsive layout. */
export function printTable({ title, subtitle, description, summary, language, columns, rows }: PrintTableOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = title;
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0';
    const cleanup = () => frame.remove();
    frame.onerror = () => { cleanup(); reject(new Error('Print document could not be loaded')); };
    frame.onload = () => {
      try {
        const printWindow = frame.contentWindow;
        if (!printWindow) throw new Error('Print window is unavailable');
        printWindow.addEventListener('afterprint', cleanup, { once: true });
        printWindow.focus();
        printWindow.print();
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    frame.srcdoc = `<!doctype html>
      <html lang="${escapeHtml(language)}"><head><meta charset="utf-8">
      <title>${escapeHtml(title)} — ${escapeHtml(subtitle)}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #111; background: white; font: 10pt Arial, sans-serif; }
        h1 { font-size: 18pt; margin: 0 0 3mm; }
        h2 { font-size: 13pt; margin: 0 0 2mm; }
        p { margin: 0 0 4mm; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9pt; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        th, td { border: 1px solid #aaa; padding: 2mm; text-align: left; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
        th { font-weight: bold; background: #eee; }
      </style></head><body>
      <h1>${escapeHtml(title)}</h1><h2>${escapeHtml(subtitle)}</h2>
      <p>${escapeHtml(description)}</p>${summary ? `<p>${escapeHtml(summary)}</p>` : ''}
      <table><thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </body></html>`;
    document.body.appendChild(frame);
  });
}

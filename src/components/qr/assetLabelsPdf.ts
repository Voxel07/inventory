import { generateQRCodeDataURL } from '../../utils/qrCode';
import type { AssetInstance, Item } from '../../types';

const COLUMNS = 3;
const ROWS = 5;
const MARGIN = 10;

/**
 * One A4 PDF with a QR label per unit (3 × 5 per page). Each code opens the item with the unit's code,
 * the same target as the single-unit label.
 */
export async function downloadAssetLabelsPdf(item: Item, assets: AssetInstance[]): Promise<void> {
  // Loaded on demand like the order slip; jspdf is only needed when labels are printed.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cellWidth = (doc.internal.pageSize.getWidth() - 2 * MARGIN) / COLUMNS;
  const cellHeight = (doc.internal.pageSize.getHeight() - 2 * MARGIN) / ROWS;
  const qrSize = Math.min(cellWidth, cellHeight) - 16;
  const images = await Promise.all(assets.map((asset) => generateQRCodeDataURL(item.id, 'item', asset.assetCode)));

  assets.forEach((asset, index) => {
    const slot = index % (COLUMNS * ROWS);
    if (index > 0 && slot === 0) doc.addPage();
    const x = MARGIN + (slot % COLUMNS) * cellWidth;
    const y = MARGIN + Math.floor(slot / COLUMNS) * cellHeight;
    const centerX = x + cellWidth / 2;
    doc.setDrawColor(200);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(x, y, cellWidth, cellHeight);
    doc.addImage(images[index], 'PNG', centerX - qrSize / 2, y + 2, qrSize, qrSize);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(asset.assetCode, centerX, y + qrSize + 7, { align: 'center', maxWidth: cellWidth - 4 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(item.name, cellWidth - 6)[0] ?? '', centerX, y + qrSize + 11.5, { align: 'center' });
  });

  doc.save(`QR-${(item.sku || item.name).replace(/[^\w-]+/g, '_')}.pdf`);
}

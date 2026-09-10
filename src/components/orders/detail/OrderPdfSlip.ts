import { jsPDF } from 'jspdf';
import { generateQRCodeDataURL } from '../../../utils/qrCode';
import type { Assembly, FactionOrder, Item } from '../../../types';

export interface GeneratePdfSlipOptions {
  order: FactionOrder;
  orderItems: Item[];
  orderAssemblies: Assembly[];
  itemMap: Map<string, Item>;
  pickupLocationLabel: string;
  language: string;
  t: (de: string, en: string) => string;
}

export async function generateOrderPdfSlip({
  order,
  orderItems,
  orderAssemblies,
  itemMap,
  pickupLocationLabel,
  language,
  t,
}: GeneratePdfSlipOptions): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const qr = await generateQRCodeDataURL(order.id, 'faction-order', order.orderCode);

  const locationLabel = (item: Item) => {
    const location = item.expand?.storageLocation;
    return location
      ? [location.name, location.area, location.location, location.position].filter(Boolean).join(' · ')
      : item.storageLocation || t('Kein Lagerort', 'No location');
  };

  type PrintRow = {
    kind: 'assembly' | 'component' | 'item';
    requested: number;
    name: string;
    details: string;
    locationKey?: string;
  };

  const assemblyRows: PrintRow[] = orderAssemblies.flatMap((assembly) => {
    const assemblyCount = order.requestedAssemblyQuantities[assembly.id] ?? 0;
    const components = Object.entries(assembly.itemQuantities ?? {})
      .map(([itemId, componentQuantity]) => {
        const item = itemMap.get(itemId);
        const location = item ? locationLabel(item) : t('Kein Lagerort', 'No location');
        return {
          kind: 'component' as const,
          requested: assemblyCount * componentQuantity,
          name: item?.name ?? itemId,
          details: [location, item?.hint].filter(Boolean).join(' · '),
          locationKey: location.toLocaleLowerCase(),
        };
      })
      .sort((a, b) => a.locationKey.localeCompare(b.locationKey));

    const componentSummary = components.length
      ? t(`${components.length} Komponenten`, `${components.length} components`)
      : t('Keine Komponenten', 'No components');

    return [
      {
        kind: 'assembly' as const,
        requested: assemblyCount,
        name: `${t('Baugruppe', 'Assembly')}: ${assembly.name}`,
        details: [componentSummary, assembly.hint].filter(Boolean).join(' · '),
      },
      ...components,
    ];
  });

  const itemRows: PrintRow[] = orderItems
    .map((item) => {
      const location = locationLabel(item);
      return {
        kind: 'item' as const,
        requested: order.requestedQuantities[item.id] ?? 0,
        name: item.name,
        details: [location, item.hint].filter(Boolean).join(' · '),
        locationKey: location.toLocaleLowerCase(),
      };
    })
    .sort((a, b) => (a.locationKey ?? '').localeCompare(b.locationKey ?? ''));

  const rows = [...assemblyRows, ...itemRows];

  // Column x positions: Done | Qty | Prepared | Item/Assembly | Location/Details
  const x = [14, 26, 44, 66, 140, 197];
  let y: number;

  function drawHeader(firstPage: boolean) {
    doc.setFontSize(firstPage ? 17 : 12);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `${order.eventType} · ${order.faction} — ${t('Kommissionierschein', 'Commissioning Slip')}`,
      14,
      firstPage ? 18 : 12,
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (firstPage) {
      doc.text(
        `${order.orderCode} · ${new Date(order.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}`,
        14,
        25,
      );
      doc.setFont('helvetica', 'bold');
      doc.text(`${t('Abholort', 'Pickup location')}:`, 14, 32);
      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(pickupLocationLabel, 132), 14, 37);
      doc.addImage(qr, 'PNG', 166, 10, 30, 30);
    } else {
      doc.text(order.orderCode, 140, 12);
    }
    const tableY = firstPage ? 54 : 18;
    const headers = [
      t('Erl.', 'Done'),
      t('Bed.', 'Qty'),
      t('Vorb.', 'Prep.'),
      t('Artikel / Baugruppe', 'Item / Assembly'),
      t('Lagerort / Komponenten', 'Location / Components'),
    ];

    for (let index = 0; index < headers.length; index += 1) {
      doc.setFillColor(235, 235, 235);
      doc.rect(x[index], tableY, x[index + 1] - x[index], 8, 'FD');
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    for (let index = 0; index < headers.length; index += 1) {
      doc.text(headers[index], x[index] + 1.5, tableY + 5.2, { maxWidth: x[index + 1] - x[index] - 3 });
    }
    doc.setFont('helvetica', 'normal');
    return tableY + 8;
  }

  y = drawHeader(true);

  function wrappedText(
    text: string,
    width: number,
    fontSize: number,
    style: 'normal' | 'bold',
    maxLines = 10,
  ): string[] {
    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text || '—', width) as string[];
    if (lines.length <= maxLines) return lines;
    const visible = lines.slice(0, maxLines);
    let lastLine = visible[maxLines - 1].trimEnd();
    while (lastLine && doc.getTextWidth(`${lastLine}...`) > width) lastLine = lastLine.slice(0, -1);
    visible[maxLines - 1] = `${lastLine}...`;
    return visible;
  }

  for (const row of rows) {
    const isAssembly = row.kind === 'assembly';
    const nameFontSize = isAssembly ? 10 : 8.5;
    const nameStyle = isAssembly || row.kind === 'item' ? 'bold' : 'normal';
    const nameWidth = isAssembly ? x[5] - x[3] - 4 : x[4] - x[3] - 4;
    const nameLines = wrappedText(
      isAssembly ? row.name : `${row.kind === 'component' ? '- ' : ''}${row.name}`,
      nameWidth,
      nameFontSize,
      nameStyle,
    );
    const detailLines = isAssembly
      ? wrappedText(row.details, nameWidth, 7.5, 'normal', 5)
      : wrappedText(row.details, x[5] - x[4] - 4, 7.5, 'normal');
    const rowHeight = isAssembly
      ? Math.max(14, nameLines.length * 4.5 + detailLines.length * 3.6 + 4)
      : Math.max(12, Math.max(nameLines.length * 4, detailLines.length * 3.6) + 4);

    if (y + rowHeight + (isAssembly ? 12 : 0) > 270) {
      doc.addPage();
      y = drawHeader(false);
    }

    if (isAssembly) doc.setFillColor(248, 232, 234);
    for (let index = 0; index < x.length - 1; index += 1) {
      if (isAssembly && index === 4) continue;
      const right = isAssembly && index === 3 ? x[5] : x[index + 1];
      doc.rect(x[index], y, right - x[index], rowHeight, isAssembly ? 'FD' : 'S');
    }

    doc.rect(x[0] + 3, y + (rowHeight - 4) / 2, 4, 4);
    doc.setFont('helvetica', isAssembly ? 'bold' : 'normal');
    doc.setFontSize(isAssembly ? 10 : 9);
    doc.text(String(row.requested), x[1] + (x[2] - x[1]) / 2, y + rowHeight / 2 + 1.5, { align: 'center' });
    doc.line(x[2] + 3, y + rowHeight / 2 + 2, x[3] - 3, y + rowHeight / 2 + 2);

    doc.setFont('helvetica', nameStyle);
    doc.setFontSize(nameFontSize);
    doc.text(nameLines, x[3] + 1.5, y + 4.8, { maxWidth: nameWidth });
    if (isAssembly) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(detailLines, x[3] + 1.5, y + 5 + nameLines.length * 4.5, { maxWidth: nameWidth });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(detailLines, x[4] + 1.5, y + 4.5, { maxWidth: x[5] - x[4] - 4 });
    }
    y += rowHeight;
  }

  if (y + 45 > 282) {
    doc.addPage();
    y = drawHeader(false);
  }
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(t('Notizen / offene Punkte', 'Notes / open tasks'), 14, y);
  doc.setFont('helvetica', 'normal');
  doc.rect(14, y + 2, 183, 22);

  y += 30;
  doc.text(
    `${t('Kommissioniert von', 'Commissioned by')}: ___________________   ${t('Datum/Uhrzeit', 'Date/Time')}: ___________________`,
    14,
    y,
  );

  doc.save(`Kommissionierschein-${order.orderCode}.pdf`);
}

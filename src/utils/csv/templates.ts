/**
 * Generates sample CSV files for download. Rows are written by column name so `Kategorie` and
 * `Unterkategorie` stay adjacent and every row type lines up with the header.
 */
const quote = (value: string) => /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
const quoteJson = (value: unknown) => quote(JSON.stringify(value));

function csv(header: readonly string[], rows: Record<string, string>[]): string {
  return [header.join(';'), ...rows.map((row) => header.map((column) => row[column] ?? '').join(';'))].join('\r\n');
}

/** `Lagerort` takes a location code (`L1-ELE-R2`), a path (`Lager 1 / Elektro / Regal 2`) or a unique name; `Position` is the place inside it. */
export function generateSampleItemsCsv(): string {
  const header = ['Artikel', 'Kategorie', 'Unterkategorie', 'Bestand', 'Mindestbestand', 'Einzelwert', 'Lagerort', 'Position', 'Lieferant', 'Verbrauchsmaterial', 'Events', 'Hinweis', 'TrackingMode', 'AssetCodes'] as const;
  return csv(header, [
    { Artikel: 'Stromerzeuger 2kW', Kategorie: 'Elektro', Unterkategorie: 'Generatoren', Bestand: '4', Mindestbestand: '2', Einzelwert: '349,00', Lagerort: 'Lager 1 / Elektro / Regal 1', Lieferant: 'Honda', Verbrauchsmaterial: 'Nein', Events: 'DE,TNO', Hinweis: 'Vor Erstinbetriebnahme Ölstand prüfen', TrackingMode: 'serialized', AssetCodes: quote('GEN-001, GEN-002, GEN-003, GEN-004') },
    { Artikel: 'Kabeltrommel 50m', Kategorie: 'Elektro', Unterkategorie: 'Kabel', Bestand: '10', Mindestbestand: '5', Einzelwert: '59,95', Lagerort: 'Lager 1 / Elektro / Regal 2', Position: 'Unten', Lieferant: 'Brennenstuhl', Verbrauchsmaterial: 'Nein', Events: 'DE,TNO,LS', Hinweis: 'Nach Gebrauch trocken aufrollen', TrackingMode: 'bulk' },
    { Artikel: 'Gaffa Tape 50m schwarz', Kategorie: 'Verbrauchsmaterial', Unterkategorie: 'Klebeband', Bestand: '24', Mindestbestand: '10', Einzelwert: '8,50', Lagerort: 'Lager 1 / Verbrauch / Kiste B', Lieferant: 'Tesa', Verbrauchsmaterial: 'Ja', Events: 'DE,TNO,LS,M24', Hinweis: 'Rückstandslos ablösbar', TrackingMode: 'bulk' },
    { Artikel: 'LED Flutlicht 100W', Kategorie: 'Beleuchtung', Unterkategorie: 'Scheinwerfer', Bestand: '8', Mindestbestand: '4', Einzelwert: '45,00', Lagerort: 'Lager 1 / Elektro / Regal 3', Position: 'Fach 2', Lieferant: 'Osram', Verbrauchsmaterial: 'Nein', Events: 'DE', Hinweis: 'Inkl. Schutzkontaktstecker', TrackingMode: 'bulk' },
  ]);
}

export function generateSampleAssembliesCsv(): string {
  const header = ['Baugruppe', 'Kategorie', 'Unterkategorie', 'Beschreibung', 'Komponenten', 'Events', 'Hinweis'] as const;
  return csv(header, [
    { Baugruppe: 'Camp-Beleuchtungsset', Kategorie: 'Beleuchtung', Unterkategorie: 'Sets', Beschreibung: 'Vollständiges Set für Torbeleuchtung', Komponenten: quote('LED Flutlicht 100W: 2; Kabeltrommel 50m: 1; Gaffa Tape 50m schwarz: 1'), Events: 'DE,TNO', Hinweis: 'Immer vor Nässe geschützt aufbauen' },
    { Baugruppe: 'Notstrom-Station', Kategorie: 'Elektro', Unterkategorie: 'Stromversorgung', Beschreibung: 'Mobile Energieversorgung für Außenposten', Komponenten: quote('Stromerzeuger 2kW: 1; Kabeltrommel 50m: 2'), Events: 'DE,LS', Hinweis: 'Nur im Freien betreiben' },
  ]);
}

export function generateSampleCombinedCsv(): string {
  const header = ['Typ', 'Name', 'Kategorie', 'Unterkategorie', 'Menge', 'Mindestbestand', 'Einzelwert', 'Lagerort', 'Position', 'Komponenten', 'Events', 'Hinweis', 'TrackingMode', 'AssetCodes',
    'Eventtyp', 'Eventdatum', 'BestellteArtikel', 'RueckgabeArtikel', 'VerbrauchteArtikel', 'Bestellstatus', 'Zweck', 'Bestellname', 'Fraktion', 'Startdatum', 'Enddatum', 'Teilnehmer', 'Zeitplan', 'Aktion', 'Daten', 'Beschreibung'] as const;
  return csv(header, [
    { Typ: 'Artikel', Name: 'Feld-PC', Kategorie: 'IT & Elektronik', Unterkategorie: 'Computer', Menge: '2', Mindestbestand: '1', Einzelwert: '650,00', Lagerort: 'Lager A / Technik / Regal 1', Events: 'DE,TNO', Hinweis: 'Live-Map Rechner', TrackingMode: 'serialized', AssetCodes: quote('PC-01, PC-02') },
    { Typ: 'Artikel', Name: 'Zeltgestänge 4x4m', Kategorie: 'Infrastruktur', Unterkategorie: 'Zelte', Menge: '6', Mindestbestand: '2', Einzelwert: '120,00', Lagerort: 'Lager A / Zelte', Position: 'Palette 1', Events: 'DE,TNO', Hinweis: 'Auf Vollständigkeit prüfen', TrackingMode: 'bulk' },
    { Typ: 'Artikel', Name: 'Zeltplane 4x4m', Kategorie: 'Infrastruktur', Unterkategorie: 'Zelte', Menge: '6', Mindestbestand: '2', Einzelwert: '180,00', Lagerort: 'Lager A / Zelte', Position: 'Palette 2', Events: 'DE,TNO', Hinweis: 'Trocken lagern', TrackingMode: 'bulk' },
    { Typ: 'Artikel', Name: 'Heringe 30cm (10er Set)', Kategorie: 'Infrastruktur', Unterkategorie: 'Zelte', Menge: '12', Mindestbestand: '4', Einzelwert: '15,00', Lagerort: 'Lager A / Zelte', Position: 'Kiste Heringe', Events: 'DE,TNO,LS', Hinweis: 'Immer nachzählen', TrackingMode: 'bulk' },
    // Lot-tracked items start at 0 so each lot below gets its own number, expiry and stock.
    { Typ: 'Artikel', Name: 'Desinfektionsmittel 1L', Kategorie: 'Sanität', Unterkategorie: 'Hygiene', Menge: '0', Mindestbestand: '5', Einzelwert: '6,90', Lagerort: 'Lager A / Sanität', Events: 'DE,TNO', Hinweis: 'Ältere Charge zuerst verwenden', TrackingMode: 'lot' },
    { Typ: 'Baugruppe', Name: 'SG-Zelt komplett', Kategorie: 'Infrastruktur', Unterkategorie: 'Zelte', Komponenten: quote('Zeltgestänge 4x4m: 1; Zeltplane 4x4m: 1; Heringe 30cm (10er Set): 2'), Events: 'DE,TNO', Hinweis: 'Komplettes Zelt mit Heringen' },
    { Typ: 'Event', Name: 'Beispiel-Event', Eventtyp: 'DE', Eventdatum: '2026-06-13', Startdatum: '2026-06-13', Enddatum: '2026-06-14',
      Teilnehmer: quoteJson([
        { personName: 'Alex König', arrivesAt: '2026-06-12T15:00', leavesAt: '2026-06-14T13:00', roles: [{ role: 'event_crew', assignment: 'Aufbau & Logistik' }] },
      ]),
      Zeitplan: quoteJson([
        { category: 'preparation', title: 'Aufbau', startsAt: '2026-06-12T15:00', endsAt: '2026-06-12T18:00', owner: 'Alex König', location: 'HQ', status: 'completed' },
        { category: 'in_game', title: 'Briefing', startsAt: '2026-06-13T09:00', endsAt: '2026-06-13T09:30', status: 'completed' },
      ]) },
    { Typ: 'AllgemeineBestellung', Name: 'Catering', Eventtyp: 'DE', Eventdatum: '2026-06-13', BestellteArtikel: quote('Heringe 30cm (10er Set): 2'), RueckgabeArtikel: quote('Heringe 30cm (10er Set): 1'), Bestellstatus: 'partially_returned', Zweck: 'Catering-Zelt' },
    { Typ: 'Return', Name: 'Heringe 30cm (10er Set)', Menge: '1', Eventtyp: 'DE', Eventdatum: '2026-06-13', Bestellname: 'Catering' },
    { Typ: 'Ausleihe', Name: 'Zeltgestänge 4x4m', Menge: '1', Eventtyp: 'DE', Fraktion: 'KGG' },
    // `@row:<Name>` passes the lot created by an earlier row to the stock booking.
    { Typ: 'Aktion', Name: 'charge-desi-2026-03', Aktion: 'lot', Beschreibung: 'Charge anlegen',
      Daten: quoteJson({ itemId: '@item:Desinfektionsmittel 1L', lotNumber: 'CH-2026-03', supplierLot: 'SAG-77812', manufactureDate: '2026-03-02', expiryDate: '2028-03-01' }) },
    { Typ: 'Aktion', Name: 'bestand-desi-2026-03', Aktion: 'stock', Beschreibung: 'Bestand der Charge buchen',
      Daten: quoteJson({ itemId: '@item:Desinfektionsmittel 1L', transactionType: 'adjusted', quantityChanged: 12, reason: 'Anfangsbestand', lotId: '@row:charge-desi-2026-03' }) },
    { Typ: 'Aktion', Name: 'charge-desi-2026-08', Aktion: 'lot', Beschreibung: 'Zweite Charge anlegen',
      Daten: quoteJson({ itemId: '@item:Desinfektionsmittel 1L', lotNumber: 'CH-2026-08', expiryDate: '2028-08-15', storageRequirements: 'Unter 25 °C lagern' }) },
    { Typ: 'Aktion', Name: 'bestand-desi-2026-08', Aktion: 'stock', Beschreibung: 'Bestand der Charge buchen',
      Daten: quoteJson({ itemId: '@item:Desinfektionsmittel 1L', transactionType: 'adjusted', quantityChanged: 6, reason: 'Anfangsbestand', lotId: '@row:charge-desi-2026-08' }) },
  ]);
}

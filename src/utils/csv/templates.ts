

/**
 * Generates sample CSV files for download
 */
export function generateSampleItemsCsv(): string {
  return [
    'Artikel;Kategorie;Bestand;Mindestbestand;Einzelwert;Lagerort;Unterkategorie;Lieferant;Verbrauchsmaterial;Events;Hinweis;TrackingMode;AssetCodes',
    'Stromerzeuger 2kW;Elektro;4;2;349,00;Regal A1;Generatoren;Honda;Nein;DE,TNO;Vor Erstinbetriebnahme Ölstand prüfen;serialized;"GEN-001, GEN-002, GEN-003, GEN-004"',
    'Kabeltrommel 50m;Elektro;10;5;59,95;Regal A2;Kabel;Brennenstuhl;Nein;DE,TNO,LS;Nach Gebrauch trocken aufrollen;bulk;',
    'Gaffa Tape 50m schwarz;Verbrauchsmaterial;24;10;8,50;Kiste B;Klebeband;Tesa;Ja;DE,TNO,LS,M24;Rückstandslos ablösbar;bulk;',
    'LED Flutlicht 100W;Beleuchtung;8;4;45,00;Regal C1;Scheinwerfer;Osram;Nein;DE;Inkl. Schutzkontaktstecker;bulk;',
  ].join('\r\n');
}

export function generateSampleAssembliesCsv(): string {
  return [
    'Baugruppe;Beschreibung;Komponenten;Events;Hinweis',
    'Camp-Beleuchtungsset;Vollständiges Set für Torbeleuchtung;"LED Flutlicht 100W: 2; Kabeltrommel 50m: 1; Gaffa Tape 50m schwarz: 1";DE,TNO;Immer vor Nässe geschützt aufbauen',
    'Notstrom-Station;Mobile Energieversorgung für Außenposten;"Stromerzeuger 2kW: 1; Kabeltrommel 50m: 2";DE,LS;Nur im Freien betreiben',
  ].join('\r\n');
}

export function generateSampleCombinedCsv(): string {
  return [
    'Typ;Name;Kategorie;Menge;Mindestbestand;Einzelwert;Lagerort;Komponenten;Events;Hinweis;TrackingMode;AssetCodes;Eventtyp;Eventdatum;BestellteArtikel;RueckgabeArtikel;VerbrauchteArtikel;Bestellstatus;Zweck;Bestellname;Fraktion',
    'Artikel;Feld-PC;IT & Elektronik;2;1;650,00;Lager A; ;DE,TNO;Live-Map Rechner;serialized;"PC-01, PC-02"',
    'Artikel;Zeltgestänge 4x4m;Infrastruktur;6;2;120,00;Lager Zelt; ;DE,TNO;Auf Vollständigkeit prüfen;bulk;',
    'Artikel;Zeltplane 4x4m;Infrastruktur;6;2;180,00;Lager Zelt; ;DE,TNO;Trocken lagern;bulk;',
    'Artikel;Heringe 30cm (10er Set);Infrastruktur;12;4;15,00;Lager Zelt; ;DE,TNO,LS;Immer nachzählen;bulk;',
    'Baugruppe;SG-Zelt komplett;Zelte; ; ; ; ;"Zeltgestänge 4x4m: 1; Zeltplane 4x4m: 1; Heringe 30cm (10er Set): 2";DE,TNO;Komplettes Zelt mit Heringen;;',
    'Event;;;;;;;;;;;;DE;2026-06-13;;;;;',
    'AllgemeineBestellung;Catering;;;;;;;;;;;DE;2026-06-13;"Heringe 30cm (10er Set): 2";"Heringe 30cm (10er Set): 1";;partially_returned;Catering-Zelt;',
    'Return;Heringe 30cm (10er Set);;1;;;;;;;;;DE;2026-06-13;;;;;;Catering',
    'Ausleihe;Zeltgestänge 4x4m;;1;;;;;;;;;DE;;;;;;;;KGG',
  ].join('\r\n');
}

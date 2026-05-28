export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatStatus(status: string): string {
  const statusTranslations: Record<string, string> = {
    // Item statuses
    'available': 'Verfügbar',
    'checked_out': 'Ausgeliehen',
    'damaged': 'Beschädigt',
    'retired': 'Ausgemustert',
    
    // Damage statuses
    'reported': 'Gemeldet',
    'in_review': 'In Prüfung',
    'repaired': 'Repariert',
    'written_off': 'Abgeschrieben',
    
    // Severity levels
    'low': 'Niedrig',
    'medium': 'Mittel',
    'high': 'Hoch',
    'critical': 'Kritisch',

    // Transaction types
    'checkout': 'Ausleihe',
    'checkin': 'Rückgabe',
    'added': 'Hinzugefügt',
  };

  return statusTranslations[status.toLowerCase()] || status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

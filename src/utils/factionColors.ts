const colors: Record<string, Record<string, string>> = {
  DE: { miliz: '#1565c0', kgg: '#c62828', gof: '#f9a825' },
  LS: { ucrf: '#1565c0', tera: '#2e7d32' },
};

/** Explicit faction colors shared by event planning views. */
export function factionColor(eventType: string, name: string | null): string | undefined {
  return colors[eventType.toUpperCase()]?.[name?.trim().toLowerCase() ?? ''];
}

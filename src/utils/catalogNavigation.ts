import type { MouseEvent } from 'react';

/** Supplement native name links so middle-click works across the clickable grid row. */
export function openCatalogRowInNewTab(event: MouseEvent<HTMLElement>, prefix: '/items' | '/assemblies') {
  if (event.button !== 1 || (event.target as HTMLElement).closest('a,button,input,[role="checkbox"]')) return;
  const id = event.currentTarget.getAttribute('data-id');
  if (!id) return;
  event.preventDefault();
  window.open(`${prefix}/${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer');
}

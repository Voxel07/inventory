import pb from '../services/pocketbaseClient';
import type { Item } from '../types';

export function itemImageUrl(item: Item, filename = item.images?.[0], thumb = '600x400'): string | undefined {
  return filename ? pb.files.getURL(item, filename, { thumb }) : undefined;
}

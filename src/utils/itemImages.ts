import { apiFileUrl } from '../services/apiClient';
import type { Item } from '../types';

export function itemImageUrl(item: Item, filename = item.images?.[0], thumb = '600x400'): string | undefined {
  void thumb;
  return apiFileUrl(filename);
}

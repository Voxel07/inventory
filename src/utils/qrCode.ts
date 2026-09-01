import QRCode from 'qrcode';

export type QRResourceType = 'item' | 'assembly' | 'faction-order';

function baseUrl(): string {
  return import.meta.env.VITE_APP_URL || window.location.origin;
}

export function getQRUrl(id: string, type: QRResourceType = 'item', textCode?: string): string {
  const url = type === 'assembly'
    ? `${baseUrl()}/assemblies/${id}`
    : type === 'faction-order'
      ? `${baseUrl()}/events/orders/${id}`
      : `${baseUrl()}/items/${id}`;
  if (!textCode) return url;
  const result = new URL(url);
  result.searchParams.set('code', textCode);
  return result.toString();
}

export function generateQRCodeDataURL(id: string, type: QRResourceType = 'item', textCode?: string): Promise<string> {
  return QRCode.toDataURL(getQRUrl(id, type, textCode), {
    width: 256,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

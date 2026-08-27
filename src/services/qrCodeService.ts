import QRCode from 'qrcode';

const BASE_URL = import.meta.env.VITE_APP_URL || window.location.origin;
export type QRResourceType = 'item' | 'assembly' | 'faction-order';

export async function generateQRCodeDataURL(itemId: string, type: QRResourceType = 'item'): Promise<string> {
  const checkoutUrl = getCheckoutUrl(itemId, type);
  return QRCode.toDataURL(checkoutUrl, {
    width: 256,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

export async function generateQRCodeSVG(itemId: string, type: QRResourceType = 'item'): Promise<string> {
  const checkoutUrl = getCheckoutUrl(itemId, type);
  return QRCode.toString(checkoutUrl, { type: 'svg', margin: 2 });
}

export function getCheckoutUrl(itemId: string, type: QRResourceType = 'item'): string {
  if (type === 'assembly') return `${BASE_URL}/assemblies/${itemId}`;
  if (type === 'faction-order') return `${BASE_URL}/events/orders/${itemId}`;
  return `${BASE_URL}/checkout/${itemId}`;
}

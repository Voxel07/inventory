import QRCode from 'qrcode';

const BASE_URL = import.meta.env.VITE_APP_URL || window.location.origin;
export type QRResourceType = 'item' | 'assembly';

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
  return type === 'assembly' ? `${BASE_URL}/assemblies/${itemId}` : `${BASE_URL}/checkout/${itemId}`;
}

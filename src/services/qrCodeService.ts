import QRCode from 'qrcode';

const BASE_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173';

export async function generateQRCodeDataURL(itemId: string): Promise<string> {
  const checkoutUrl = `${BASE_URL}/checkout/${itemId}`;
  return QRCode.toDataURL(checkoutUrl, {
    width: 256,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

export async function generateQRCodeSVG(itemId: string): Promise<string> {
  const checkoutUrl = `${BASE_URL}/checkout/${itemId}`;
  return QRCode.toString(checkoutUrl, { type: 'svg', margin: 2 });
}

export function getCheckoutUrl(itemId: string): string {
  return `${BASE_URL}/checkout/${itemId}`;
}

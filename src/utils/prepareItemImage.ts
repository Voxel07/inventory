const MAX_DIMENSION = 2048;
const MAX_PIXELS = 40_000_000;
const MAX_BYTES = 20 * 1024 * 1024;
const preparedImages = new WeakSet<File>();

export interface ImageCrop { x: number; y: number; width: number; height: number }

export function calculateImageCrop(width: number, height: number, aspect: number, zoom: number, x: number, y: number): ImageCrop {
  const cropWidth = Math.min(width, height * aspect) / zoom;
  const cropHeight = cropWidth / aspect;
  return { x: (width - cropWidth) * x, y: (height - cropHeight) * y, width: cropWidth, height: cropHeight };
}

// Canvas encoders can add their own ICC profile. Keep pixel/alpha chunks only.
// RIFF layout: https://developers.google.com/speed/webp/docs/riff_container
async function stripWebpMetadata(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const fourCC = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 12 || fourCC(0) !== 'RIFF' || fourCC(8) !== 'WEBP'
      || view.getUint32(4, true) + 8 !== bytes.length) {
    throw new Error('The browser returned an invalid WebP image.');
  }
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error('Invalid WebP chunk.');
    const type = fourCC(offset);
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + size % 2;
    if (end > bytes.length) throw new Error('Invalid WebP chunk length.');
    if (['VP8X', 'VP8 ', 'VP8L', 'ALPH'].includes(type)) {
      const chunk = bytes.slice(offset, end);
      if (type === 'VP8X') {
        if (size !== 10) throw new Error('Invalid WebP extended header.');
        chunk[8] &= ~0x2c; // Clear ICC, EXIF and XMP feature bits; preserve alpha.
      }
      chunks.push(chunk);
    }
    offset = end;
  }
  const output = new Uint8Array(12 + chunks.reduce((size, chunk) => size + chunk.length, 0));
  output.set(bytes.subarray(0, 12));
  new DataView(output.buffer).setUint32(4, output.length - 8, true);
  let offset = 12;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export async function decodeImage(file: File): Promise<ImageBitmap> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Please select a JPEG, PNG or WebP image.');
  }
  if (file.size > MAX_BYTES) throw new Error('Images must be smaller than 20 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This image could not be decoded. Please select a valid JPEG, PNG or WebP image.');
  }
  if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
    bitmap.close();
    throw new Error('Images must contain no more than 40 million pixels.');
  }
  return bitmap;
}

/** Re-encode pixels only: apply camera orientation, discard source metadata and filename. */
export async function prepareItemImage(file: File, options?: { crop?: ImageCrop; maxDimension?: number }): Promise<File> {
  // Crops prepared in the editor should not be compressed again on submission.
  if (!options && preparedImages.has(file)) return file;
  const bitmap = await decodeImage(file);
  try {
    const crop = options?.crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    const maxDimension = options?.maxDimension ?? MAX_DIMENSION;
    if (!Object.values(crop).every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
        || crop.x + crop.width > bitmap.width + 0.001 || crop.y + crop.height > bitmap.height + 0.001
        || !Number.isFinite(maxDimension) || maxDimension < 256 || maxDimension > MAX_DIMENSION) {
      throw new Error('Invalid image crop or output size.');
    }
    const scale = Math.min(1, maxDimension / Math.max(crop.width, crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width * scale));
    canvas.height = Math.max(1, Math.round(crop.height * scale));
    const context = canvas.getContext('2d', { colorSpace: 'srgb' });
    if (!context) throw new Error('Image conversion is unavailable in this browser.');
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    // Some browsers silently return PNG when WebP encoding is unavailable.
    if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot convert images to WebP.');
    const prepared = new File([await stripWebpMetadata(blob)], 'image.webp', { type: 'image/webp' });
    preparedImages.add(prepared);
    return prepared;
  } finally {
    bitmap.close();
  }
}

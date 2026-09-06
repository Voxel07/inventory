import { calculateImageCrop, prepareItemImage } from '/src/utils/prepareItemImage.ts';
import React from 'react';
import { createRoot } from 'react-dom/client';

const results = document.getElementById('results');
const lines = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  lines.push(`PASS: ${message}`);
  results.textContent = lines.join('\n');
}
const makeBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type));
async function waitUntil(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for rendered image');
}
function webpChunks(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const text = (offset, count) => new TextDecoder().decode(bytes.slice(offset, offset + count));
  check(text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP', 'Output is a real WebP file');
  const chunks = [];
  for (let offset = 12; offset + 8 <= bytes.length;) {
    chunks.push(text(offset, 4));
    const size = view.getUint32(offset + 4, true);
    offset += 8 + size + (size % 2);
  }
  return chunks;
}

try {
  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#ff0000');
  gradient.addColorStop(1, '#0000ff');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const png = await makeBlob(canvas, 'image/png');
  const converted = await prepareItemImage(new File([png], 'private-original-name.png', { type: 'image/png' }));
  const bitmap = await createImageBitmap(converted);
  check(bitmap.width === 2048 && bitmap.height === 512, 'Large PNG is resized proportionally to 2048 pixels');
  bitmap.close();
  check(converted.type === 'image/webp' && converted.name === 'image.webp', 'Original filename is removed before upload');
  check(converted.size < png.size, `WebP saves space on generated fixture (${png.size} → ${converted.size} bytes)`);

  canvas.width = 64;
  canvas.height = 32;
  context.fillStyle = '#008000';
  context.fillRect(0, 0, 32, 32);
  const transparent = await prepareItemImage(new File([await makeBlob(canvas, 'image/png')], 'alpha.png', { type: 'image/png' }));
  const alphaBitmap = await createImageBitmap(transparent);
  check(alphaBitmap.width === 64 && alphaBitmap.height === 32, 'Small images are not upscaled');
  context.clearRect(0, 0, 64, 32);
  context.drawImage(alphaBitmap, 0, 0);
  check(context.getImageData(60, 16, 1, 1).data[3] === 0, 'PNG transparency survives conversion');
  alphaBitmap.close();

  const jpeg = new Uint8Array(await (await makeBlob(canvas, 'image/jpeg')).arrayBuffer());
  // Minimal EXIF TIFF with Orientation=6 (rotate 90 degrees clockwise).
  const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
  const secret = new TextEncoder().encode('Private camera metadata');
  const comment = new Uint8Array([255,254,0,secret.length + 2, ...secret]);
  const oriented = await prepareItemImage(new File([jpeg.slice(0, 2), exif, comment, jpeg.slice(2)], 'camera.jpg', { type: 'image/jpeg' }));
  const orientedBitmap = await createImageBitmap(oriented);
  check(orientedBitmap.width === 32 && orientedBitmap.height === 64, 'JPEG EXIF orientation is applied before stripping metadata');
  orientedBitmap.close();
  const buffer = await oriented.arrayBuffer();
  const chunks = webpChunks(buffer);
  check(!chunks.some((chunk) => ['EXIF', 'XMP ', 'ICCP'].includes(chunk)), 'WebP has no EXIF, XMP or source color profile metadata');
  check(!new TextDecoder().decode(buffer).includes('Private camera metadata'), 'Original JPEG comments are removed');

  let rejected = false;
  try { await prepareItemImage(new File(['invalid'], 'fake.jpg', { type: 'image/jpeg' })); }
  catch { rejected = true; }
  check(rejected, 'Invalid image bytes are rejected');
  rejected = false;
  try { await prepareItemImage(new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' })); }
  catch { rejected = true; }
  check(rejected, 'Unsupported formats are rejected');
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (callback) { callback(new Blob(['png'], { type: 'image/png' })); };
  rejected = false;
  try { await prepareItemImage(new File([png], 'photo.png', { type: 'image/png' })); }
  catch { rejected = true; }
  finally { HTMLCanvasElement.prototype.toBlob = originalToBlob; }
  check(rejected, 'Silent PNG fallback is rejected when WebP encoding is unavailable');

  canvas.width = 2048;
  canvas.height = 1024;
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, 1024, 1024);
  context.fillStyle = '#0000ff';
  context.fillRect(1024, 0, 1024, 1024);
  const cropSource = new File([await makeBlob(canvas, 'image/png')], 'crop.png', { type: 'image/png' });
  const region = calculateImageCrop(2048, 1024, 1, 1, 1, 0.5);
  const cropped = await prepareItemImage(cropSource, { crop: region, maxDimension: 512 });
  const cropBitmap = await createImageBitmap(cropped);
  check(cropBitmap.width === 512 && cropBitmap.height === 512, 'Crop aspect ratio and selected output size are applied');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(cropBitmap, 0, 0);
  const pixel = context.getImageData(256, 256, 1, 1).data;
  check(pixel[2] > 220 && pixel[0] < 30, 'Moving the crop selects the correct visible pixels');
  cropBitmap.close();
  const zoomed = calculateImageCrop(2048, 1024, 1, 2, 0.5, 0.5);
  check(zoomed.width === 512 && zoomed.height === 512 && zoomed.x === 768, 'Zoom crops around the chosen position');
  check(await prepareItemImage(cropped) === cropped, 'Prepared crops are not compressed again during upload');
  rejected = false;
  try { await prepareItemImage(cropSource, { crop: { x: 2000, y: 0, width: 500, height: 500 } }); } catch { rejected = true; }
  check(rejected, 'Out-of-bounds crops are rejected');

  window.__ENV__ = { API_URL: location.origin };
  const { setDevelopmentSession, clearAuth } = await import('/src/services/authManager.ts');
  const { apiFileUrl, fetchMedia } = await import('/src/services/apiClient.ts');
  const { MediaImage } = await import('/src/components/common/MediaImage.tsx');
  const savedSession = sessionStorage.getItem('ash.inventory.authSession');
  const originalFetch = window.fetch;
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  let authorization;
  let requests = 0;
  const root = createRoot(document.getElementById('image'));
  try {
    window.fetch = async (url, options) => {
      if (String(url).startsWith(`${location.origin}/api/media/`)) {
        authorization = options.headers.Authorization;
        requests++;
        return new Response(converted, { headers: { 'Content-Type': 'image/webp' } });
      }
      throw new Error('Unexpected network request during media test');
    };
    URL.revokeObjectURL = (url) => { revoked.push(url); originalRevoke.call(URL, url); };
    setDevelopmentSession('media-test-token', { id: 'test', name: 'Image Test', role: 'admin' });
    root.render(React.createElement(MediaImage, { src: apiFileUrl('items/version/item-id.webp'), alt: 'Converted inventory image', sx: { width: 256 } }));
    await waitUntil(() => document.querySelector('#image img')?.naturalWidth > 0);
    check(authorization === 'Bearer media-test-token', 'Image requests include the bearer token');
    check(document.querySelector('#image img').naturalWidth === 2048, 'Authenticated media renders as an actual image');
    const before = requests;
    rejected = false;
    try { await fetchMedia('https://external.example/image.webp'); } catch { rejected = true; }
    check(rejected && requests === before, 'Credentials are never sent to external image URLs');
    clearAuth();
    await waitUntil(() => !document.querySelector('#image img'));
    check(revoked.length > 0, 'Logout removes the image and releases its blob URL');
  } finally {
    root.unmount();
    window.fetch = originalFetch;
    URL.revokeObjectURL = originalRevoke;
    if (savedSession) sessionStorage.setItem('ash.inventory.authSession', savedSession);
    else sessionStorage.removeItem('ash.inventory.authSession');
  }
  results.textContent = `${lines.join('\n')}\n\nAll ${lines.length} checks passed.`;
} catch (error) {
  results.textContent = `${lines.join('\n')}\nFAIL: ${error.stack || error}`;
  console.error(error);
}

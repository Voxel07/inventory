/* Manual preview of item/assembly image editing: crop, removal, ordering and the saved payload. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fixtureAssembly, fixtureItem, fixtureUser } from './fixtures/dto';

window.__ENV__ = { API_URL: location.origin };
// Runtime configuration is read at module load, so the app modules are imported after __ENV__ is set.
const { setDevelopmentSession } = await import('../src/services/authManager');
const { AssemblyForm } = await import('../src/components/forms/AssemblyForm');
const { ItemForm } = await import('../src/components/forms/ItemForm');
const { updateAssembly } = await import('../src/services/assemblyService');
const { updateItem } = await import('../src/services/inventoryService');
setDevelopmentSession('editor-test-token', fixtureUser('admin'));

const canvas = document.createElement('canvas');
canvas.width = 1600;
canvas.height = 800;
const context = canvas.getContext('2d')!;
context.fillStyle = '#ef4444';
context.fillRect(0, 0, 800, 800);
context.fillStyle = '#2563eb';
context.fillRect(800, 0, 800, 800);
context.fillStyle = 'white';
context.font = 'bold 90px sans-serif';
context.fillText('LEFT', 210, 420);
context.fillText('RIGHT', 990, 420);
const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Canvas export failed')), 'image/png'));
const item = fixtureItem({ id: 'item-test', name: 'Test item', images: ['first.png', 'second.png'] });
const assembly = fixtureAssembly({ id: 'assembly-test', name: 'Test assembly', description: 'Image editing fixture', image: 'assembly.png', itemQuantities: { [item.id]: 1 } });
const result = document.getElementById('result')!;
let uploadNumber = 0;
let dimensions: string | undefined;
window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
  const method = init.method ?? 'GET';
  if (new Headers(init.headers).get('Authorization') !== 'Bearer editor-test-token') throw new Error('Missing authentication');
  if (path.startsWith('/api/media/') && method === 'GET') return new Response(blob, { headers: { 'Content-Type': 'image/png' } });
  if (path === '/api/media' && method === 'POST') {
    const file = (init.body as FormData).get('file') as File;
    const bitmap = await createImageBitmap(file);
    dimensions = `${bitmap.width}×${bitmap.height} ${file.type}`;
    bitmap.close();
    return Response.json({ key: `uploaded-${++uploadNumber}.webp` });
  }
  if (path === '/api/items/item-test' && method === 'GET') return Response.json(item);
  if (path === '/api/items/item-test' && method === 'PATCH') {
    const body = JSON.parse(String(init.body)) as { images: string[] };
    result.textContent = `Item saved. Images in order: ${body.images.join(', ')}. Upload: ${dimensions || 'none'}`;
    return Response.json({ ...item, ...body });
  }
  if (path === '/api/assemblies/assembly-test' && method === 'PATCH') {
    const body = JSON.parse(String(init.body)) as { image?: string; removeImage?: boolean };
    result.textContent = `Assembly saved. Image: ${body.image || (body.removeImage ? 'removed' : 'unchanged')}. Upload: ${dimensions || 'none'}`;
    return Response.json({ ...assembly, ...body });
  }
  if (path === '/api/items') return Response.json([item], { headers: { 'X-Has-More': 'false' } });
  throw new Error(`Unexpected request: ${method} ${path}`);
};
const failed = (error: unknown) => { result.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`; };
const editItem = new URLSearchParams(location.search).has('item');
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    {editItem
      ? <ItemForm title="Edit item" initialData={item} onCancel={() => {}} onSubmit={(data) => { updateItem(item.id, data).catch(failed); }} />
      : <AssemblyForm title="Edit assembly" initialData={assembly} onCancel={() => {}} onSubmit={(data) => { updateAssembly(assembly.id, data).catch(failed); }} />}
  </QueryClientProvider>,
);

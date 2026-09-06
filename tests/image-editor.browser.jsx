import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

window.__ENV__ = { API_URL: location.origin };
const { setDevelopmentSession } = await import('/src/services/authManager.ts');
const { AssemblyForm } = await import('/src/components/forms/AssemblyForm.tsx');
const { ItemForm } = await import('/src/components/forms/ItemForm.tsx');
const { updateAssembly } = await import('/src/services/assemblyService.ts');
const { updateItem } = await import('/src/services/inventoryService.ts');
setDevelopmentSession('editor-test-token', { id: 'editor-test', name: 'Editor Test', role: 'admin' });

const canvas = document.createElement('canvas');
canvas.width = 1600;
canvas.height = 800;
const context = canvas.getContext('2d');
context.fillStyle = '#ef4444';
context.fillRect(0, 0, 800, 800);
context.fillStyle = '#2563eb';
context.fillRect(800, 0, 800, 800);
context.fillStyle = 'white';
context.font = 'bold 90px sans-serif';
context.fillText('LEFT', 210, 420);
context.fillText('RIGHT', 990, 420);
const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
const item = { id: 'item-test', name: 'Test item', category: 'Equipment', amount: 1, minStock: 0, value: 0, storageLocation: '', images: ['first.png', 'second.png'], created: new Date().toISOString(), updated: new Date().toISOString() };
const assembly = { id: 'assembly-test', name: 'Test assembly', description: 'Image editing fixture', image: 'assembly.png', itemIds: [item.id], itemQuantities: { [item.id]: 1 } };
const result = document.getElementById('result');
let uploadNumber = 0;
let dimensions;
window.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  if (options.headers?.Authorization !== 'Bearer editor-test-token') throw new Error('Missing authentication');
  if (path.startsWith('/api/media/') && !options.method) return new Response(blob, { headers: { 'Content-Type': 'image/png' } });
  if (path === '/api/media' && options.method === 'POST') {
    const file = options.body.get('file');
    const bitmap = await createImageBitmap(file);
    dimensions = `${bitmap.width}×${bitmap.height} ${file.type}`;
    bitmap.close();
    return Response.json({ key: `uploaded-${++uploadNumber}.webp` });
  }
  if (path === '/api/items/item-test' && options.method === 'GET') return Response.json(item);
  if (path === '/api/items/item-test' && options.method === 'PATCH') {
    const body = JSON.parse(options.body);
    result.textContent = `Item saved. Images in order: ${body.images.join(', ')}. Upload: ${dimensions || 'none'}`;
    return Response.json({ ...item, ...body });
  }
  if (path === '/api/assemblies/assembly-test' && options.method === 'PATCH') {
    const body = JSON.parse(options.body);
    result.textContent = `Assembly saved. Image: ${body.image || (body.removeImage ? 'removed' : 'unchanged')}. Upload: ${dimensions || 'none'}`;
    return Response.json({ ...assembly, ...body });
  }
  throw new Error(`Unexpected request: ${options.method} ${path}`);
};
const useItem = new URLSearchParams(location.search).has('item');
const Form = useItem ? ItemForm : AssemblyForm;
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={new QueryClient()}>
    <Form initialData={useItem ? item : assembly} items={[item]}
      onSubmit={async (data) => {
        try { if (useItem) await updateItem(item.id, data); else await updateAssembly(assembly.id, data); }
        catch (error) { result.textContent = `FAIL: ${error.message}`; }
      }} />
  </QueryClientProvider>,
);

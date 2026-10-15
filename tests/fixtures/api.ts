/*
 * Mock transport for browser previews. Collection responses follow the paged API contract: `page`/`size` slice the
 * rows and `X-Has-More` reports continuation, so previews exercise the same paging code as the real backend.
 */
export type FixtureRequest = { url: URL; path: string; method: string; body: unknown };
export type FixtureHandler = (request: FixtureRequest) => unknown | Response | Promise<unknown | Response>;

/** Rows matching the repeated `id` query parameter, as `GET /api/items?id=…` does. */
export function byIds<T extends { id: string }>(rows: T[], url: URL): T[] {
  const ids = url.searchParams.getAll('id');
  return ids.length ? rows.filter((row) => ids.includes(row.id)) : rows;
}

function respond(data: unknown, url: URL): Response {
  if (!Array.isArray(data) || !url.searchParams.has('size')) return Response.json(data ?? null);
  const size = Number(url.searchParams.get('size'));
  const page = Number(url.searchParams.get('page') ?? 0);
  const rows = data.slice(page * size, (page + 1) * size);
  return Response.json(rows, { headers: { 'X-Has-More': String((page + 1) * size < data.length) } });
}

/** Routes requests to `fixture.invalid` through `handler`; other requests (Vite modules, fonts) pass through. */
export function installFixtureApi(handler: FixtureHandler, host = 'fixture.invalid'): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== host) return originalFetch(input, init);
    if (url.pathname === '/api/events/stream') {
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"heartbeat"}\n\n')); } }),
        { headers: { 'Content-Type': 'text/event-stream' } });
    }
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    const result = await handler({ url, path: url.pathname, method: init.method ?? 'GET', body });
    return result instanceof Response ? result : respond(result, url);
  };
}

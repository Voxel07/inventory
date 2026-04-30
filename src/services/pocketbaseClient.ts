import PocketBase from 'pocketbase';

declare global {
  interface Window {
    __ENV__?: {
      POCKETBASE_URL?: string;
    };
  }
}

const POCKETBASE_URL =
  window.__ENV__?.POCKETBASE_URL ||
  import.meta.env.VITE_POCKETBASE_URL ||
  'http://127.0.0.1:8090';

const pb = new PocketBase(POCKETBASE_URL);

pb.autoCancellation(false);

export default pb;

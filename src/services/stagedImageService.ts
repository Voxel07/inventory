import { deleteMedia, uploadMedia } from './apiClient';
import { prepareItemImage } from '../utils/prepareItemImage';

interface StagedImage {
  promise: Promise<string>;
  key?: string;
  released: boolean;
}

const stagedImages = new WeakMap<File, StagedImage>();
let preparationQueue = Promise.resolve();

/** Prepare and upload an image once, then reuse the staged object during form submission. */
export function stageImage(file: File): Promise<string> {
  const existing = stagedImages.get(file);
  if (existing) return existing.promise;

  const staged: StagedImage = {
    promise: Promise.resolve(''),
    released: false,
  };
  const prepared = preparationQueue.then(() => prepareItemImage(file));
  preparationQueue = prepared.then(() => undefined, () => undefined);
  staged.promise = prepared
    .then(uploadMedia)
    .then(async (key) => {
      staged.key = key;
      if (staged.released) {
        await deleteMedia(key);
      }
      return key;
    });
  stagedImages.set(file, staged);
  return staged.promise;
}

/** Delete an abandoned staged upload, including one that is still being prepared. */
export function releaseStagedImage(file: File): void {
  const staged = stagedImages.get(file);
  if (!staged || staged.released) return;
  staged.released = true;
  if (staged.key) {
    void deleteMedia(staged.key).catch(() => undefined).finally(() => stagedImages.delete(file));
  } else {
    void staged.promise.catch(() => undefined).finally(() => stagedImages.delete(file));
  }
}

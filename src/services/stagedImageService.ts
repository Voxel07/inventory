import { deleteMedia, uploadMedia } from './apiClient';
import { prepareItemImage } from '../utils/prepareItemImage';
import { assertAuthSession, captureAuthSession, type AuthSessionContext } from './authManager';

interface StagedImage {
  context: AuthSessionContext;
  promise: Promise<string>;
  key?: string;
  released: boolean;
}

const stagedImages = new WeakMap<File, StagedImage>();
let preparationQueue = Promise.resolve();

/** Prepare and upload an image once, then reuse the staged object during form submission. */
export function stageImage(file: File, context = captureAuthSession()): Promise<string> {
  assertAuthSession(context);
  const existing = stagedImages.get(file);
  if (existing?.context.generation === context.generation) return existing.promise;

  const staged: StagedImage = {
    context,
    promise: Promise.resolve(''),
    released: false,
  };
  const prepared = preparationQueue.then(() => prepareItemImage(file));
  preparationQueue = prepared.then(() => undefined, () => undefined);
  staged.promise = prepared
    .then((image) => uploadMedia(image, context))
    .then(async (key) => {
      assertAuthSession(context);
      staged.key = key;
      if (staged.released) {
        await deleteMedia(key, context);
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
    void deleteMedia(staged.key, staged.context).catch(() => undefined).finally(() => {
      if (stagedImages.get(file) === staged) stagedImages.delete(file);
    });
  } else {
    void staged.promise.catch(() => undefined).finally(() => {
      if (stagedImages.get(file) === staged) stagedImages.delete(file);
    });
  }
}

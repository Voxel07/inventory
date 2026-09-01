import pb from './pocketbaseClient';
import type { User, UserPermissionsFormData } from '../types';

const COLLECTION = 'users';

export async function getUsers(): Promise<User[]> {
  return pb.collection(COLLECTION).getFullList<User>({
    sort: 'name,email',
  });
}

export async function updateUserPermissions(userId: string, data: UserPermissionsFormData): Promise<User> {
  return pb.collection(COLLECTION).update<User>(userId, data);
}

export function subscribeToUsers(callback: () => void) {
  let disposed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  pb.collection(COLLECTION).subscribe('*', callback).then((cleanup) => {
    if (disposed) void cleanup();
    else unsubscribe = cleanup;
  }).catch((error) => console.warn(`Failed to subscribe to ${COLLECTION}:`, error));
  return () => {
    disposed = true;
    void unsubscribe?.();
  };
}

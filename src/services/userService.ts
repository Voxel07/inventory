import pb from './pocketbaseClient';
import type { User } from '../types';

const COLLECTION = 'users';

export async function getUsers(): Promise<User[]> {
  return pb.collection(COLLECTION).getFullList<User>({
    sort: 'name,email',
  });
}

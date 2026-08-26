import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../services/userService';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });
}

import { useQuery } from '@tanstack/react-query';
import { equipmentApi } from '../services/equipmentService';

export function useEquipmentAvailability(eventId?: string) {
  return useQuery({ queryKey: ['items', 'equipment-availability', eventId], queryFn: () => equipmentApi.availability(eventId), staleTime: 0 });
}

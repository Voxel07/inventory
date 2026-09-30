import { queryKeys } from '../utils/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { equipmentApi } from '../services/equipmentService';

export function useEquipmentProfile(itemId: string) {
  return useQuery({ queryKey: queryKeys.equipment(itemId), queryFn: () => equipmentApi.get(itemId), enabled: Boolean(itemId) });
}

export function useEquipmentAvailability(eventId?: string) {
  return useQuery({ queryKey: queryKeys.equipmentAvailability(eventId), queryFn: () => equipmentApi.availability(eventId), staleTime: 0 });
}

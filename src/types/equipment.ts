export interface EquipmentCommitment {
  id: string; eventId?: string; eventName?: string; quantity: number; assetIds: string[];
  availableFrom: string; availableUntil: string; pickupDetails: string;
  returnDue?: string; returnDetails?: string; notes: string;
  status: 'active' | 'scheduled' | 'expired' | 'cancelled'; cancellationReason?: string; recordedBy: string;
}
export interface EquipmentProfile {
  itemId: string; ownershipType: 'organization' | 'private_owner' | 'external';
  ownerName?: string; keeperName?: string; keeperContact?: string;
  availabilityPolicy: 'available' | 'commitment_required' | 'unavailable';
  revision: number; commitments: EquipmentCommitment[];
}
export interface EquipmentAvailability { available: number; assetIds: string[]; pickupAllowed: boolean }

export interface EquipmentProfileInput { ownershipType: EquipmentProfile['ownershipType']; ownerName?: string | null; keeperName?: string | null; keeperContact?: string | null; availabilityPolicy: EquipmentProfile['availabilityPolicy']; revision: number; reason: string }
export interface EquipmentCommitmentInput { eventId?: string | null; quantity: number; assetIds?: string[]; availableFrom: string; availableUntil: string; pickupDetails: string; returnDue?: string | null; returnDetails?: string | null; notes: string; revision: number }
export interface EquipmentCancelInput { revision: number; reason: string }

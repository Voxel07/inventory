import type { EquipmentProfileInput, EquipmentCommitmentInput } from '../types/equipment';
import { inputChoice, inputNumber, inputStrings, inputText, optionalNumber, optionalText, type InputValues } from '../utils/inputValues';

export function equipmentProfileInput(v: InputValues): EquipmentProfileInput {
  return { ownershipType: inputChoice(v.ownershipType, ['organization', 'private_owner', 'external']), availabilityPolicy: inputChoice(v.availabilityPolicy, ['available', 'commitment_required', 'unavailable']), ownerName: optionalText(v.ownerName), keeperName: optionalText(v.keeperName), keeperContact: optionalText(v.keeperContact), revision: inputNumber(v.revision), reason: inputText(v.reason) };
}
export function equipmentCommitmentInput(v: InputValues): EquipmentCommitmentInput {
  return { eventId: optionalText(v.eventId), quantity: inputNumber(v.quantity), assetIds: inputStrings(v.assetIds), availableFrom: inputNumber(v.availableFrom), availableUntil: inputNumber(v.availableUntil), pickupDetails: inputText(v.pickupDetails), returnDue: optionalNumber(v.returnDue), returnDetails: optionalText(v.returnDetails), notes: inputText(v.notes), revision: inputNumber(v.revision) };
}

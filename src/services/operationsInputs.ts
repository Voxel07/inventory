import type { CountInput, LotInput, ReceiptInput, ReceiptLineInput, RepairInput, RepairTransitionInput, ScheduleInput, TransferInput, VendorDocumentInput } from '../types/operations';
import { LOT_STATUSES } from '../types/operations';
import { inputBoolean, inputChoice, inputNumber, inputRows, inputStrings, inputText, optionalNumber, optionalText, type InputValues } from '../utils/inputValues';

export function lotInput(v: InputValues): LotInput {
  return { lotNumber: inputText(v.lotNumber).trim(), expiryDate: optionalNumber(v.expiryDate), status: v.status == null || v.status === '' ? undefined : inputChoice(v.status, LOT_STATUSES) };
}
export function transferInput(v: InputValues): TransferInput {
  return { transferNumber: optionalText(v.transferNumber), sourceLocationId: inputText(v.sourceLocationId), destinationLocationId: inputText(v.destinationLocationId), idempotencyKey: inputText(v.idempotencyKey), notes: optionalText(v.notes), lines: inputRows(v.lines).map((line) => ({ itemId: inputText(line.itemId), assetInstanceId: optionalText(line.assetInstanceId), lotId: optionalText(line.lotId), quantity: inputNumber(line.quantity) })) };
}
export function countInput(v: InputValues): CountInput {
  return { sessionNumber: optionalText(v.sessionNumber), locationId: optionalText(v.locationId), category: optionalText(v.category), itemId: optionalText(v.itemId), blindCount: inputBoolean(v.blindCount), notes: optionalText(v.notes) };
}
export function scheduleInput(v: InputValues): ScheduleInput {
  return { itemId: inputText(v.itemId), assetInstanceId: optionalText(v.assetInstanceId), maintenanceType: inputChoice(v.maintenanceType, ['dguv_v3', 'generator_service', 'battery_test', 'chrono_fps']), intervalType: inputChoice(v.intervalType, ['date', 'operating_hours', 'usage_count']), intervalValue: inputNumber(v.intervalValue), nextDueAt: optionalNumber(v.nextDueAt), nextDueValue: optionalNumber(v.nextDueValue), warningWindow: optionalNumber(v.warningWindow), responsiblePersonId: optionalText(v.responsiblePersonId), requiredChecklist: optionalText(v.requiredChecklist), checkoutBlocking: inputBoolean(v.checkoutBlocking), active: v.active == null ? undefined : inputBoolean(v.active) };
}
export function repairInput(v: InputValues): RepairInput {
  return { damageReportId: inputText(v.damageReportId), repairOwnerId: optionalText(v.repairOwnerId), vendorId: optionalText(v.vendorId), partsAndCostNotes: optionalText(v.partsAndCostNotes), notes: optionalText(v.notes), occurredAt: optionalNumber(v.occurredAt) };
}
export function repairTransitionInput(v: InputValues): RepairTransitionInput {
  return { status: inputChoice(v.status, ['reported', 'triaged', 'awaiting_repair', 'in_repair', 'repaired', 'verified', 'returned_to_service', 'written_off']), amount: optionalNumber(v.amount), repairOwnerId: optionalText(v.repairOwnerId), vendorId: optionalText(v.vendorId), verificationResult: optionalText(v.verificationResult), notes: optionalText(v.notes), idempotencyKey: optionalText(v.idempotencyKey), occurredAt: optionalNumber(v.occurredAt) };
}
function receiptLineInput(v: InputValues): ReceiptLineInput {
  return { purchaseOrderLineId: inputText(v.purchaseOrderLineId), acceptedQuantity: inputNumber(v.acceptedQuantity, 0), damagedQuantity: inputNumber(v.damagedQuantity, 0), rejectedQuantity: inputNumber(v.rejectedQuantity, 0), lotId: optionalText(v.lotId), newLot: v.newLot == null ? undefined : lotInput(v.newLot as InputValues), assetCodes: inputStrings(v.assetCodes), receivingNotes: optionalText(v.receivingNotes) };
}
export function receiptInput(v: InputValues): ReceiptInput {
  return { purchaseOrderId: inputText(v.purchaseOrderId), receivingLocationId: inputText(v.receivingLocationId), receiptNumber: optionalText(v.receiptNumber), receivedAt: optionalNumber(v.receivedAt), idempotencyKey: inputText(v.idempotencyKey), notes: optionalText(v.notes), lines: inputRows(v.lines).map(receiptLineInput) };
}
export function vendorDocumentInput(v: InputValues): VendorDocumentInput {
  return { vendorId: inputText(v.vendorId), purchaseOrderId: optionalText(v.purchaseOrderId), goodsReceiptId: optionalText(v.goodsReceiptId), documentType: inputChoice(v.documentType, ['invoice', 'delivery_note', 'quote', 'warranty', 'certificate', 'other']), documentDate: optionalNumber(v.documentDate), referenceNumber: optionalText(v.referenceNumber), totalAmountCents: optionalNumber(v.totalAmountCents), currency: optionalText(v.currency), retentionUntil: optionalNumber(v.retentionUntil), notes: optionalText(v.notes) };
}

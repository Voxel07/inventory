package org.ash.inventory.model;

public final class DomainEnums {
    private DomainEnums() {}

    /**
     * Role ladder, declared from least to most privileged: every role includes all rights of the
     * roles before it. Keep this order; {@link UserRole#atLeast} and highest-role selection depend on it.
     */
    public enum UserRole {
        tenant, read_only, faction_leader, ash, warehouse_crew, admin;

        public boolean atLeast(UserRole minimum) { return ordinal() >= minimum.ordinal(); }
    }
    public enum TrackingMode { bulk, serialized, lot_tracked }
    public enum InventoryRole { consumable, returnable }
    public enum AssetState { available, reserved, staged, in_transit, in_custody, in_field, returned_pending_check, damaged, in_repair, in_maintenance, lost, written_off }
    public enum ConditionStatus { new_condition, good, fair, damaged, unsafe, lost }
    public enum MaintenanceStatus { certified, due_soon, overdue, in_service }
    public enum MaintenanceType { dguv_v3, generator_service, battery_test, chrono_fps }
    public enum MaintenanceResult { passed, failed, advisory }
    public enum OrderStatus { draft, submitted, preparing, ready, picked_up, partially_returned, returned, closed, cancelled }
    public enum TransactionType { received, adjusted, reserved, reservation_released, transfer_out, transfer_in, staged, checkout, checkin, added, consumed, damaged, missing, repaired, written_off }
    public enum DamageSeverity { low, medium, high, critical, total_loss }
    public enum DamageStatus { reported, triaged, awaiting_repair, in_review, in_repair, repaired, verified, returned_to_service, written_off, resolved }
    public enum ReservationStatus { active, partially_released, converted_to_custody, released, closed }
    public enum HandoverType { checkout, checkin }
    public enum ReconciliationOutcome { returned_good, consumed, returned_damaged, missing, returned_late, written_off }
    public enum ReturnSubmissionStatus { pending, accepted, rejected }
    public enum TransferStatus { requested, picking, in_transit, partially_received, received, cancelled }
    public enum PurchaseOrderStatus { draft, ordered, partially_received, received, cancelled, closed }
    public enum GoodsReceiptStatus { draft, posted, partially_accepted, rejected, reversed }
    public enum VendorDocumentType { invoice, delivery_note, quote, warranty, certificate, other }
    public enum CountStatus { draft, counting, awaiting_recount, awaiting_approval, approved, posted, cancelled }
    public enum MaintenanceIntervalType { date, operating_hours, usage_count }
    public enum RepairStatus { reported, triaged, awaiting_repair, in_repair, repaired, verified, returned_to_service, written_off }
    public enum LotStatus { available, hold, recalled, expired, depleted }
    public enum OutboxStatus { pending, processing, published, failed, dead_letter }
}

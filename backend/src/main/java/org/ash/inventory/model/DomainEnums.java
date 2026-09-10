package org.ash.inventory.model;

public final class DomainEnums {
    private DomainEnums() {}

    public enum UserRole { hq_admin, warehouse_crew, marshal, event_planner, maintenance_crew, faction_leader, read_only }
    public enum TrackingMode { bulk, serialized, lot_tracked }
    public enum InventoryRole { consumable, returnable, repairable, rental }
    public enum AssetState { available, reserved, staged, in_custody, in_field, returned_pending_check, damaged, in_repair, in_maintenance, lost, written_off }
    public enum ConditionStatus { new_condition, good, fair, damaged, unsafe, lost }
    public enum LocationType { warehouse, bin, staging, event_site, vehicle, in_custody, quarantine, repair, scrap }
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
    public enum TransferStatus { requested, picking, in_transit, partially_received, received, cancelled }
    public enum PurchaseOrderStatus { draft, ordered, partially_received, received, cancelled, closed }
    public enum GoodsReceiptStatus { draft, posted, partially_accepted, rejected, reversed }
    public enum VendorDocumentType { invoice, delivery_note, quote, warranty, certificate, other }
    public enum CountStatus { draft, counting, awaiting_recount, awaiting_approval, approved, posted, cancelled }
    public enum MaintenanceIntervalType { date, operating_hours, usage_count }
    public enum RepairStatus { reported, triaged, awaiting_repair, in_repair, repaired, verified, returned_to_service, written_off }
    public enum LotStatus { available, hold, recalled, expired, depleted }
    public enum CodeTargetType { product, asset, location, assembly, container, lot }
    public enum OutboxStatus { pending, processing, published, failed, dead_letter }
}

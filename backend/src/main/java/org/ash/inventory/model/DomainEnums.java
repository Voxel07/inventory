package org.ash.inventory.model;

public final class DomainEnums {
    private DomainEnums() {}

    public enum UserRole { admin, inventory_manager, warehouse_packer, faction_leader }
    public enum MaintenanceStatus { certified, due_soon, overdue, in_service }
    public enum MaintenanceType { dguv_v3, generator_service, battery_test, chrono_fps }
    public enum MaintenanceResult { passed, failed, advisory }
    public enum OrderStatus { draft, submitted, preparing, ready, picked_up, partially_returned, returned, closed, cancelled }
    public enum TransactionType { checkout, checkin, added, repaired, written_off, consumed }
    public enum DamageSeverity { low, medium, high, critical, total_loss }
    public enum DamageStatus { reported, in_review, repaired, written_off, resolved }
}

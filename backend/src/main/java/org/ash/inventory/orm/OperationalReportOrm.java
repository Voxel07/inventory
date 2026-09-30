package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import java.util.List;
import java.time.Instant;

/** Persistence queries for the OperationalReport use cases. Business rules remain in the service. */
@ApplicationScoped
public class OperationalReportOrm extends EntityOrm {
    public record Header(long version, Instant startedAt, Instant generatedAt, String sourceToken) {}
    public Header header(String name) {
        var rows = entityManager.createQuery("select r.version, r.startedAt, r.generatedAt, r.sourceToken from OperationalReport r where r.name = :name", Object[].class)
                .setParameter("name", name).getResultList();
        if (rows.isEmpty()) return null;
        var row = rows.getFirst();
        return new Header(((Number) row[0]).longValue(), (Instant) row[1], (Instant) row[2], (String) row[3]);
    }

    /** Hibernate UNION ALL retains every table's count/max evidence in one database statement. */
    public List<Object[]> watermarks() {
        var queries = new java.util.ArrayList<String>();
        for (String type : List.of("Item", "StorageLocation", "Warehouse", "EventOccurrence", "FactionOrder", "FactionOrderLine", "GeneralOrder",
                "UserAccount", "Vendor", "StockReservation", "InventoryPosition", "InventoryLot", "AssetInstance", "ReturnSubmission", "DamageReport", "RepairCase", "MaintenanceSchedule", "MaintenanceRecord",
                "PurchaseOrder", "PurchaseOrderLine", "InventoryCountSession", "InventoryCountLine", "StockTransaction", "EquipmentCommitment", "LoanArrangement", "MemberRequest", "DomainEvent")) {
            String timestamp = type.equals("DomainEvent") ? "occurredAt" : type.equals("MaintenanceRecord") ? "createdAt" : "updatedAt";
            queries.add("select '" + type + "', count(e), max(e." + timestamp + ") from " + type + " e");
        }
        return entityManager.createQuery(String.join(" union all ", queries), Object[].class).getResultList();
    }

    public <T> List<T> all(Class<T> type) {
        return entityManager.createQuery("from " + type.getSimpleName() + " order by id", type).getResultList();
    }

    public List<StockTransaction> outcomeMovements() {
        return entityManager.createQuery("from StockTransaction t where t.type in :types order by t.occurredAt, t.id", StockTransaction.class)
                .setParameter("types", List.of(DomainEnums.TransactionType.consumed, DomainEnums.TransactionType.written_off)).getResultList();
    }
}

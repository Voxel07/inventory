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

    public <T> List<T> all(Class<T> type) {
        String fetch = switch (type.getSimpleName()) {
            case "Item" -> " left join fetch e.storageLocation sl left join fetch sl.warehouse left join fetch e.returnLocation rl left join fetch rl.warehouse";
            case "AssetInstance" -> " join fetch e.item left join fetch e.currentLocation l left join fetch l.warehouse";
            case "RepairCase" -> " join fetch e.damageReport d left join fetch d.item left join fetch e.assetInstance a left join fetch a.currentLocation l left join fetch l.warehouse left join fetch e.repairOwner left join fetch e.repairVendor";
            case "DamageReport" -> " left join fetch e.item left join fetch e.assembly left join fetch e.assetInstance";
            case "MaintenanceSchedule" -> " join fetch e.item left join fetch e.assetInstance a left join fetch a.currentLocation l left join fetch l.warehouse left join fetch e.responsiblePerson";
            case "PurchaseOrderLine" -> " join fetch e.item join fetch e.purchaseOrder p join fetch p.vendor";
            case "InventoryCountLine" -> " join fetch e.item join fetch e.session left join fetch e.location l left join fetch l.warehouse left join fetch e.assetInstance";
            default -> "";
        };
        return entityManager.createQuery("select e from " + type.getSimpleName() + " e" + fetch + " order by e.id", type).getResultList();
    }

    public List<StockTransaction> outcomeMovements() {
        return entityManager.createQuery("from StockTransaction t join fetch t.item join fetch t.user left join fetch t.eventOccurrence left join fetch t.factionOrder left join fetch t.assetInstance where t.type in :types order by t.occurredAt, t.id", StockTransaction.class)
                .setParameter("types", List.of(DomainEnums.TransactionType.consumed, DomainEnums.TransactionType.written_off)).getResultList();
    }
}

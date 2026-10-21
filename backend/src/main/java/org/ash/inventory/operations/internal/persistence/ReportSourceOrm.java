package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.*;
@ApplicationScoped
public class ReportSourceOrm extends EntityOrm {
    @org.eclipse.microprofile.config.inject.ConfigProperty(name="inventory.reports.max-source-rows",defaultValue="25000") int maxRows;
    /**
     * Budgets rows a report materializes, never whole source tables: the append-only ledger only invalidates reports.
     * {@link #all} and {@link #outcomeMovements} bound themselves; current-state facts and ledger sums stay unbudgeted.
     * The event report also loads every event's order lines and direct movements through event metrics.
     */
    public void assertBudget(String report) {
        if(!report.equals("events"))return;
        budget("select 1 from order_lines l join orders o on o.id=l.order_id where o.event_occurrence_id is not null and o.status<>'cancelled'");
        budget("select 1 from stock_transactions t where t.event_occurrence_id is not null and t.order_id is null and (t.related_entity_type is null or t.related_entity_type='restock')");
    }
    private void budget(String rows){
        if(maxRows<1)throw new IllegalArgumentException("Invalid report source budget");
        long count=((Number)entityManager.createNativeQuery("select count(*) from ("+rows+" limit :limit) budget")
                .setParameter("limit",Math.addExact(maxRows,1)).getSingleResult()).longValue();
        if(count>maxRows)throw new ApiException(413,"Report source exceeds its row budget");
    }
    private <T> List<T> bounded(jakarta.persistence.TypedQuery<T> query){
        if(maxRows<1)throw new IllegalArgumentException("Invalid report source budget");
        var rows=query.setMaxResults(Math.addExact(maxRows,1)).getResultList();
        if(rows.size()>maxRows)throw new ApiException(413,"Report source exceeds its row budget");return rows;
    }
    public <T> List<T> all(Class<T> type) {
        String fetch = switch (type.getSimpleName()) {
            case "Item" -> " left join fetch e.storageLocation sl left join fetch e.returnLocation rl";
            case "AssetInstance" -> " join fetch e.item left join fetch e.currentLocation l";
            case "RepairCase" -> " join fetch e.damageReport d left join fetch d.item left join fetch e.assetInstance a left join fetch a.currentLocation l left join fetch e.repairOwner left join fetch e.repairVendor";
            case "DamageReport" -> " left join fetch e.item left join fetch e.assembly left join fetch e.assetInstance";
            case "MaintenanceSchedule" -> " join fetch e.item left join fetch e.assetInstance a left join fetch a.currentLocation l left join fetch e.responsiblePerson";
            case "PurchaseOrderLine" -> " join fetch e.item join fetch e.purchaseOrder p join fetch p.vendor";
            case "InventoryCountLine" -> " join fetch e.item join fetch e.session left join fetch e.location l left join fetch e.assetInstance";
            default -> "";
        };
        return bounded(entityManager.createQuery("select e from " + type.getSimpleName() + " e" + fetch + " order by e.id", type));
    }

    public List<StockTransaction> outcomeMovements() {
        return bounded(entityManager.createQuery("from StockTransaction t join fetch t.item join fetch t.user left join fetch t.eventOccurrence left join fetch t.order left join fetch t.assetInstance where t.type in :types order by t.occurredAt, t.id", StockTransaction.class)
                .setParameter("types", List.of(DomainEnums.TransactionType.consumed, DomainEnums.TransactionType.written_off)));
    }
}

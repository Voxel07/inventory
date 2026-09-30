package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import java.util.List;

/** Persistence queries for the OperationalReport use cases. Business rules remain in the service. */
@ApplicationScoped
public class OperationalReportOrm extends EntityOrm {
    public Object[] watermark(String type, String timestamp) {
        return entityManager.createQuery("select count(e), max(e." + timestamp + ") from " + type + " e", Object[].class).getSingleResult();
    }

    public Object[] eventWatermark() {
        return entityManager.createQuery("select count(e), max(e.occurredAt) from DomainEvent e", Object[].class).getSingleResult();
    }

    public <T> List<T> all(Class<T> type) {
        return entityManager.createQuery("from " + type.getSimpleName() + " order by id", type).getResultList();
    }

    public List<MaintenanceSchedule> blockingSchedules(Item item) {
        return entityManager.createQuery("from MaintenanceSchedule s where s.item = :item and s.active = true and s.checkoutBlocking = true", MaintenanceSchedule.class)
                .setParameter("item", item).getResultList();
    }

    public List<StockTransaction> outcomeMovements() {
        return entityManager.createQuery("from StockTransaction t where t.type in :types order by t.occurredAt, t.id", StockTransaction.class)
                .setParameter("types", List.of(DomainEnums.TransactionType.consumed, DomainEnums.TransactionType.written_off)).getResultList();
    }
}

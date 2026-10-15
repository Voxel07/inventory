package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class OrderPickupOrm extends EntityOrm {
    /** For mixed-group reads: the service masks locations the viewer cannot access. */
    public StorageLocation pickupLocation(UUID id) { return entityManager.find(StorageLocation.class, id); }
    public List<OrderLine> lines(InventoryOrder order) {
        return entityManager.createQuery("select l from OrderLine l join fetch l.item i left join fetch i.responsiblePerson where l.order = :order", OrderLine.class)
                .setParameter("order", order).getResultList();
    }
    /** Notices carry the order link in their payload; it identifies the order for both order kinds. */
    public boolean notified(UserAccount recipient, String type, String path) {
        return (Boolean) entityManager.createNativeQuery("select exists(select 1 from notifications where recipient_id = :recipient and type = :type and payload ->> 'path' = :path)")
                .setParameter("recipient", recipient.id).setParameter("type", type).setParameter("path", path).getSingleResult();
    }
}

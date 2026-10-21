package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.OrderLine;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.UserAccount;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class OrderPickupOrm extends EntityOrm {
    /** Warehouse staff may assign anyone; other actors only themselves and people in their sharing groups. */
    public List<UserAccount> responsibilityPeople(UserAccount actor) {
        boolean warehouse = actor.role.atLeast(DomainEnums.UserRole.warehouse_crew);
        var query = entityManager.createQuery("from UserAccount u where u.active = true" + (warehouse ? "" : """
                 and (u = :actor or exists (select g.id from InventoryAccessGroup g
                    where (g.owner = :actor or :actor member of g.members)
                    and (g.owner = u or u member of g.members)))
                """) + " order by u.name, u.id", UserAccount.class);
        if (!warehouse) query.setParameter("actor", actor);
        return query.getResultList();
    }
    /** For mixed-group reads: the service masks locations the viewer cannot access. */
    public StorageLocation pickupLocation(UUID id) { return entityManager.find(StorageLocation.class, id); }
    public List<OrderLine> lines(InventoryOrder order) {
        return entityManager.createQuery("select l from OrderLine l join fetch l.item i left join fetch i.responsiblePerson where l.order = :order", OrderLine.class)
                .setParameter("order", order).getResultList();
    }
    /** Notices carry the order link in their payload; it identifies the order for both order kinds. */
}

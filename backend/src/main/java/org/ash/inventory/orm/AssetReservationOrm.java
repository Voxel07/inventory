package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.OrderLineAssetAssignment;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Resolves which open order holds a reserved or staged serialized asset. */
@ApplicationScoped
public class AssetReservationOrm {
    public record Holder(String kind, UUID orderId, String label) {}

    private static final List<DomainEnums.OrderStatus> OPEN_ORDER =
            List.of(DomainEnums.OrderStatus.submitted, DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.ready);

    private final EntityManager entityManager;

    public AssetReservationOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public Map<UUID, Holder> holders(Collection<UUID> assetIds) {
        var result = new HashMap<UUID, Holder>();
        if (assetIds.isEmpty()) return result;
        entityManager.createQuery("select assignment from OrderLineAssetAssignment assignment "
                        + "join fetch assignment.order o join fetch o.faction "
                        + "where assignment.assetInstance.id in :ids and o.status in :open", OrderLineAssetAssignment.class)
                .setParameter("ids", assetIds).setParameter("open", OPEN_ORDER).getResultList()
                .forEach(assignment -> result.put(assignment.assetInstance.id, new Holder("faction_order", assignment.order.id,
                        assignment.order.orderCode + " · " + assignment.order.faction.name)));
        var wanted = assetIds.stream().filter(id -> !result.containsKey(id)).toList();
        if (wanted.isEmpty()) return result;
        for (var row : entityManager.createQuery("""
                select o.id, o.name, a.assetInstance.id from GeneralOrderLineAsset a join a.line l join l.order o
                where o.status in ('preparing', 'ready') and a.assetInstance.id in :ids
                """, Object[].class).setParameter("ids", wanted).getResultList()) {
            result.putIfAbsent((UUID) row[2], new Holder("general_order", (UUID) row[0], (String) row[1]));
        }
        return result;
    }
}

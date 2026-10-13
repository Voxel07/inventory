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
        var wanted = assetIds.stream().filter(id -> !result.containsKey(id)).map(UUID::toString).toList();
        if (wanted.isEmpty()) return result;
        // Filter the jsonb assignments in SQL so only orders holding a wanted asset are read.
        for (var value : entityManager.createNativeQuery("""
                select o.id, o.name, a.value from general_orders o
                cross join lateral jsonb_each(o.asset_assignments) e
                cross join lateral jsonb_array_elements_text(e.value) a
                where o.status in ('preparing', 'ready') and lower(a.value) in (:ids)
                """, Object[].class).setParameter("ids", wanted).getResultList()) {
            var row = (Object[]) value;
            result.putIfAbsent(UUID.fromString(row[2].toString()),
                    new Holder("general_order", UUID.fromString(row[0].toString()), row[1].toString()));
        }
        return result;
    }
}

package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.CustodyHandoverLine;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.MemberRequest;
import org.ash.inventory.operations.internal.model.ReturnSubmission;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.UserAccount;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

/** Persistence queries for the Member use cases. Business rules remain in the service. */
@ApplicationScoped
public class MemberOrm extends EntityOrm {
    @jakarta.inject.Inject InventoryAccessOrm access;
    public record CustodyAsset(java.util.UUID order, java.util.UUID item, AssetInstance asset, int pending) {}
    public List<CustodyAsset> custodyAssets(java.util.Collection<java.util.UUID> orders) {
        if (orders.isEmpty()) return List.of();
        var assets = entityManager.createQuery("""
                select distinct l from CustodyHandoverLine l join fetch l.assetInstance a join fetch a.item
                join fetch l.handover h join fetch h.order
                where h.order.id in :orders and h.type = checkout and l.assetInstance is not null
                    and not exists (select r.id from ReturnReconciliation r where r.order = h.order
                        and r.assetInstance = a and r.outcome <> missing)
                """, CustodyHandoverLine.class).setParameter("orders", orders).getResultList();
        var pending = new java.util.HashMap<String, Integer>();
        for (var row : entityManager.createQuery("select r.order.id, r.assetInstance.id, sum(r.quantity) from ReturnSubmission r where r.order.id in :orders and r.status = pending and r.assetInstance is not null group by r.order.id, r.assetInstance.id", Object[].class)
                .setParameter("orders", orders).getResultList()) pending.put(row[0] + ":" + row[1], Math.toIntExact(((Number) row[2]).longValue()));
        var result = new java.util.LinkedHashMap<String, CustodyAsset>();
        for (var line : assets) {
            String key = line.handover.order.id + ":" + line.assetInstance.id;
            result.put(key, new CustodyAsset(line.handover.order.id, line.item.id, line.assetInstance, pending.getOrDefault(key, 0)));
        }
        return List.copyOf(result.values());
    }
    public java.util.Map<UUID, String> assetCodes(java.util.Collection<UUID> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        return entityManager.createQuery("select a.id, a.assetCode from AssetInstance a where a.id in :ids", Object[].class).setParameter("ids", ids)
                .getResultStream().collect(java.util.stream.Collectors.toMap(row -> (UUID) row[0], row -> (String) row[1]));
    }
    public java.util.Map<UUID, Item> custodyItems(java.util.Collection<UUID> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        return entityManager.createQuery("from Item i where i.id in :ids", Item.class).setParameter("ids", ids)
                .getResultStream().collect(java.util.stream.Collectors.toMap(i -> i.id, i -> i));
    }
    public List<InventoryPosition> storedPositions(UserAccount actor) {
        return entityManager.createQuery("from InventoryPosition p join fetch p.item join fetch p.location where p.location.keeperUser = :actor and p.location.active = true and p.quantityOnHand > 0", InventoryPosition.class).setParameter("actor", actor).getResultList();
    }

    public List<AssetInstance> storedAssets(UserAccount actor) {
        return entityManager.createQuery("from AssetInstance a join fetch a.item join fetch a.currentLocation where a.currentLocation.keeperUser = :actor and a.currentLocation.active = true and a.active = true", AssetInstance.class).setParameter("actor", actor).getResultList();
    }

    public Stream<MemberRequest> requestCommands(UUID commandId) {
        return entityManager.createQuery("from MemberRequest where commandId = :id", MemberRequest.class).setParameter("id", commandId).getResultStream();
    }

    public Stream<ReturnSubmission> returnCommands(UUID commandId) {
        return entityManager.createQuery("from ReturnSubmission where memberCommandId = :id", ReturnSubmission.class).setParameter("id", commandId).getResultStream();
    }

    public List<MemberRequest> requests(UserAccount actor, boolean staff, int offset, int limit) {

        var query = entityManager.createQuery("from MemberRequest r join fetch r.item join fetch r.requester left join fetch r.asset left join fetch r.location left join fetch r.handledBy where 1 = 1"
                + (staff ? "" : " and r.requester = :actor") + InventoryAccessOrm.scope("request", "r") + " order by r.createdAt desc, r.id desc", MemberRequest.class);
        if (!staff) query.setParameter("actor", actor);
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }
}

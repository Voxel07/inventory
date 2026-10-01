package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.TypedQuery;
import org.ash.inventory.model.*;
import java.util.*;

@ApplicationScoped
public class InventoryAccessOrm extends EntityOrm {
    /** Use this predicate before pagination; :accessActor/:accessAdmin are bound below. */
    public static String visible(String policy) {
        return "(" + policy + " is null or :accessAdmin = true or exists (select p.id from InventoryAccessPolicy p where p = " + policy
                + " and (p.owner.id = :accessActor or exists (select g.id from InventoryAccessGrant g where g.policy = p"
                + " and (g.user.id = :accessActor or exists (select grp.id from InventoryAccessGroup grp"
                + " join grp.members member where grp = g.group and member.id = :accessActor))))))";
    }
    public static <T> TypedQuery<T> bind(TypedQuery<T> query, UserAccount actor) {
        return query.setParameter("accessAdmin", actor.role == DomainEnums.UserRole.hq_admin)
                .setParameter("accessActor", actor.id);
    }
    public List<InventoryAccessGrant> grants(InventoryAccessPolicy policy) {
        return entityManager.createQuery("from InventoryAccessGrant g left join fetch g.user left join fetch g.group where g.policy = :policy", InventoryAccessGrant.class)
                .setParameter("policy", policy).getResultList();
    }
    public boolean granted(InventoryAccessPolicy policy, UserAccount actor, boolean edit) {
        return !entityManager.createQuery("select g.id from InventoryAccessGrant g where g.policy = :policy"
                + (edit ? " and g.canEdit = true" : "")
                + " and (g.user = :actor or exists (select grp.id from InventoryAccessGroup grp join grp.members member where grp = g.group and member = :actor))", UUID.class)
                .setParameter("policy", policy).setParameter("actor", actor).setMaxResults(1).getResultList().isEmpty();
    }
    public void deleteGrants(InventoryAccessPolicy policy) {
        entityManager.createQuery("delete from InventoryAccessGrant g where g.policy = :policy").setParameter("policy", policy).executeUpdate();
    }
    public List<InventoryAccessGroup> groups() {
        return entityManager.createQuery("select distinct g from InventoryAccessGroup g left join fetch g.members order by g.name", InventoryAccessGroup.class).getResultList();
    }
    public void lockGroupPolicies(UUID groupId) {
        var policies = entityManager.createQuery("select distinct p from InventoryAccessPolicy p where exists (select g.id from InventoryAccessGrant g where g.policy = p and g.group.id = :group) order by p.id", InventoryAccessPolicy.class)
                .setParameter("group", groupId).getResultList();
        policies.forEach(this::lock);
    }
    public void lockGrantedGroups(InventoryAccessPolicy policy) {
        var groups = entityManager.createQuery("select distinct grp from InventoryAccessGroup grp where exists (select g.id from InventoryAccessGrant g where g.policy = :policy and g.group = grp) order by grp.id", InventoryAccessGroup.class)
                .setParameter("policy", policy).getResultList();
        groups.forEach(this::lock);
    }
    public boolean locationOccupied(StorageLocation location) {
        return !entityManager.createQuery("select p.id from InventoryPosition p where p.location = :location and (p.quantityOnHand > 0 or p.quantityInTransit > 0)", UUID.class)
                .setParameter("location", location).setMaxResults(1).getResultList().isEmpty()
                || !entityManager.createQuery("select a.id from AssetInstance a where a.currentLocation = :location and a.active = true", UUID.class)
                .setParameter("location", location).setMaxResults(1).getResultList().isEmpty();
    }
    public boolean currentCommitments(Item item) {
        return !entityManager.createQuery("select c.id from EquipmentCommitment c where c.item = :item and c.cancelled = false and c.availableUntil >= :today", UUID.class)
                .setParameter("item", item).setParameter("today", java.time.LocalDate.now()).setMaxResults(1).getResultList().isEmpty();
    }
    public List<UserAccount> people() {
        return entityManager.createQuery("from UserAccount order by name, id", UserAccount.class).getResultList();
    }
    public List<Item> privateItems() {
        return entityManager.createQuery("from Item i join fetch i.accessPolicy p join fetch p.owner", Item.class).getResultList();
    }
    public List<StorageLocation> privateLocations() {
        return entityManager.createQuery("from StorageLocation l join fetch l.accessPolicy p join fetch p.owner", StorageLocation.class).getResultList();
    }
    public Set<UUID> deniedReferences(UserAccount actor) {
        if (actor.role == DomainEnums.UserRole.hq_admin) return Set.of();
        var roots = new HashSet<UUID>();
        for (var i : privateItems()) if (!i.accessPolicy.owner.id.equals(actor.id) && !granted(i.accessPolicy, actor, false)) roots.add(i.id);
        for (var l : privateLocations()) if (!l.accessPolicy.owner.id.equals(actor.id) && !granted(l.accessPolicy, actor, false)) roots.add(l.id);
        return relatedReferences(roots);
    }
    public static String excluding(String alias, Set<UUID> denied) { return denied.isEmpty() ? "" : " and " + alias + ".id not in :privateDenied"; }
    public static <T> TypedQuery<T> bindDenied(TypedQuery<T> query, Set<UUID> denied) {
        return denied.isEmpty() ? query : query.setParameter("privateDenied", denied);
    }
    /** IDs of evidence/aggregates that must not reveal an unauthorized item or location indirectly. */
    public Map<UUID, Set<UUID>> referenceOrigins(Set<UUID> roots) {
        if (roots.isEmpty()) return Map.of();
        String sql = """
            with recursive edges(source, target) as (
                select item_id as source, id as target from asset_instances where item_id is not null
                union all select item_id as source, id as target from inventory_lots where item_id is not null
                union all select item_id as source, id as target from inventory_positions where item_id is not null
                union all select item_id as source, id as target from damage_reports where item_id is not null
                union all select item_id as source, id as target from maintenance_records where item_id is not null
                union all select item_id as source, id as target from maintenance_schedules where item_id is not null
                union all select item_id as source, id as target from equipment_commitments where item_id is not null
                union all select item_id as source, id as target from return_submissions where item_id is not null
                union all select item_id as source, id as target from member_requests where item_id is not null
                union all select item_id as source, id as target from custody_handover_lines where item_id is not null
                union all select item_id as source, id as target from stock_transactions where item_id is not null
                union all select item_id as source, id as target from faction_order_lines where item_id is not null
                union all select item_id as source, id as target from inventory_count_lines where item_id is not null
                union all select item_id as source, id as target from inventory_count_sessions where item_id is not null
                union all select item_id as source, id as target from inventory_transfer_lines where item_id is not null
                union all select item_id as source, id as target from stock_reservations where item_id is not null
                union all select item_id as source, id as target from item_images where item_id is not null
                union all select item_id as source, id as target from goods_receipt_lines where item_id is not null
                union all select item_id as source, id as target from purchase_order_lines where item_id is not null
                union all select item_id as source, id as target from return_reconciliations where item_id is not null
                union all select item_id as source, id as target from planning_overrides where item_id is not null
                union all select location_id as source, id as target from inventory_positions where location_id is not null
                union all select location_id as source, id as target from inventory_count_lines where location_id is not null
                union all select location_id as source, id as target from inventory_count_sessions where location_id is not null
                union all select source_location_id as source, id as target from inventory_transfers where source_location_id is not null
                union all select destination_location_id as source, id as target from inventory_transfers where destination_location_id is not null
                union all select source_location_id as source, id as target from stock_transactions where source_location_id is not null
                union all select destination_location_id as source, id as target from stock_transactions where destination_location_id is not null
                union all select location_id as source, id as target from stock_reservations where location_id is not null
                union all select location_id as source, id as target from member_requests where location_id is not null
                union all select provider_location_id as source, id as target from loan_arrangements where provider_location_id is not null
                union all select location_id as source, id as target from custody_handovers where location_id is not null
                union all select receiving_location_id as source, id as target from goods_receipts where receiving_location_id is not null
                union all select pickup_location_id as source, id as target from faction_orders where pickup_location_id is not null
                union all select target_id as source, id as target from inventory_codes where target_id is not null
                union all select damage_report_id as source, id as target from repair_cases where damage_report_id is not null
                union all select commitment_id as source, id as target from loan_arrangements where commitment_id is not null
                union all select item_id as source, assembly_id as target from assembly_items where item_id is not null
                union all select id as source, faction_order_id as target from faction_order_lines where id is not null
                union all select id as source, count_session_id as target from inventory_count_lines where id is not null
                union all select id as source, transfer_id as target from inventory_transfer_lines where id is not null
                union all select id as source, purchase_order_id as target from purchase_order_lines where id is not null
                union all select id as source, goods_receipt_id as target from goods_receipt_lines where id is not null
                union all select id as source, handover_id as target from custody_handover_lines where id is not null
                union all select purchase_order_id as source, id as target from vendor_documents where purchase_order_id is not null
                union all select goods_receipt_id as source, id as target from vendor_documents where goods_receipt_id is not null
                union all select purchase_order_id as source, id as target from goods_receipts where purchase_order_id is not null
                union all select value::uuid as source, o.id as target from general_orders o,
                lateral jsonb_each_text(o.source_locations) as source_location
                where value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                union all select key::uuid as source, o.id as target from general_orders o,
                lateral jsonb_object_keys(o.requested_quantities || o.prepared_quantities || o.handed_over_quantities
                    || o.returned_quantities || o.consumed_quantities || o.damaged_quantities || o.missing_quantities
                    || o.written_off_quantities || o.asset_assignments || o.source_locations) as key
                where key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            ), protected(root, id) as (
                select id, id from items where id in (:roots)
                union select id, id from storage_locations where id in (:roots)
                union select p.root, e.target from edges e join protected p on e.source = p.id
            ) select root, id from protected
            """;
        List<?> rows = entityManager.createNativeQuery(sql).setParameter("roots", roots).getResultList();
        var result = new HashMap<UUID, Set<UUID>>();
        for (var value : rows) {
            var row = (Object[]) value;
            result.computeIfAbsent(UUID.fromString(row[0].toString()), ignored -> new HashSet<>()).add(UUID.fromString(row[1].toString()));
        }
        return result;
    }

    public Set<UUID> relatedReferences(Set<UUID> roots) {
        return referenceOrigins(roots).values().stream().flatMap(Set::stream).collect(java.util.stream.Collectors.toSet());
    }

}

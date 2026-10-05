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
    public List<Object[]> policyViews(Collection<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return entityManager.createQuery("select p.id, p.owner.id, p.owner.name, p.revision from InventoryAccessPolicy p where p.id in :ids", Object[].class)
                .setParameter("ids", ids).getResultList();
    }
    public List<Object[]> grantViews(Collection<UUID> ids, UUID actor) {
        if (ids.isEmpty()) return List.of();
        return entityManager.createQuery("""
                select g.policy.id, u.id, grp.id, grp.name, g.canEdit,
                    case when exists (select m.id from InventoryAccessGroup members join members.members m
                        where members = grp and m.id = :actor) then true else false end
                from InventoryAccessGrant g left join g.user u left join g.group grp where g.policy.id in :ids
                """, Object[].class).setParameter("ids", ids).setParameter("actor", actor).getResultList();
    }
    public List<StorageLocation> projectionLocations(Collection<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return entityManager.createQuery("from StorageLocation l left join fetch l.warehouse left join fetch l.parent where l.id in :ids", StorageLocation.class)
                .setParameter("ids", ids).getResultList();
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
    public Set<UUID> deniedReferences(UserAccount actor) {
        return relatedReferences(deniedRoots(actor, null));
    }
    /** Two set-based authorization reads, independent of the number of policies. */
    private Set<UUID> deniedRoots(UserAccount actor, Set<UUID> candidates) {
        if (actor.role == DomainEnums.UserRole.hq_admin || candidates != null && candidates.isEmpty()) return Set.of();
        var roots = new HashSet<UUID>();
        for (String type : List.of("Item", "StorageLocation", "Assembly")) {
            var query = entityManager.createQuery("select r.id from " + type + " r where r.accessPolicy is not null"
                    + " and not " + visible("r.accessPolicy")
                    + (candidates == null ? "" : " and r.id in :candidates"), UUID.class);
            if (candidates != null) query.setParameter("candidates", candidates);
            roots.addAll(bind(query, actor).getResultList());
        }
        return roots;
    }
    public static String excluding(String alias, Set<UUID> denied) { return denied.isEmpty() ? "" : " and " + alias + ".id not in :privateDenied"; }
    public static <T> TypedQuery<T> bindDenied(TypedQuery<T> query, Set<UUID> denied) {
        return denied.isEmpty() ? query : query.setParameter("privateDenied", denied);
    }
    // Both traversal directions share the same evidence graph, including JSON
    // order references. UNION in the recursion also terminates cycles.
    private static final String REFERENCE_EDGES = """
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
                union all select assembly_id as source, id as target from damage_reports where assembly_id is not null
                union all select source_assembly_id as source, id as target from faction_order_lines where source_assembly_id is not null
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
            """;

    /** IDs of evidence/aggregates that must not reveal an unauthorized item or location indirectly. */
    public Map<UUID, Set<UUID>> referenceOrigins(Set<UUID> roots) {
        if (roots.isEmpty()) return Map.of();
        String sql = "with recursive edges(source, target) as not materialized (" + REFERENCE_EDGES + "), " + """
            protected(root, id) as (
                select id, id from items where id in (:roots)
                union select id, id from storage_locations where id in (:roots)
                union select id, id from assemblies where id in (:roots)
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

    /** Walk only the ancestors of IDs present in a response or command. */
    public Map<UUID, Set<UUID>> privateReferenceOrigins(Set<UUID> references) {
        if (references.isEmpty() || !privateRootsExist()) return Map.of();
        String sql = "with recursive edges(source, target) as not materialized (" + REFERENCE_EDGES + "), " + """
            roots(id) as not materialized (
                select id from items where access_policy_id is not null
                union select id from storage_locations where access_policy_id is not null
                union select id from assemblies where access_policy_id is not null
            ), ancestors(reference, id) as (
                select id, id from roots where id in (:references)
                union select target, source from edges where target in (:references)
                union select a.reference, e.source from edges e join ancestors a on e.target = a.id
            ) select distinct a.reference, a.id from ancestors a join roots r on r.id = a.id
            """;
        List<?> rows = entityManager.createNativeQuery(sql).setParameter("references", references).getResultList();
        var result = new HashMap<UUID, Set<UUID>>();
        for (var value : rows) {
            var row = (Object[]) value;
            result.computeIfAbsent(UUID.fromString(row[0].toString()), ignored -> new HashSet<>())
                    .add(UUID.fromString(row[1].toString()));
        }
        return result;
    }

    /** Every response is filtered; skip the graph walk while nothing is private. */
    private boolean privateRootsExist() {
        return !entityManager.createNativeQuery("""
                select 1 where exists (select 1 from items where access_policy_id is not null)
                    or exists (select 1 from storage_locations where access_policy_id is not null)
                    or exists (select 1 from assemblies where access_policy_id is not null)
                """).getResultList().isEmpty();
    }

    public record ReferenceAccess(Set<UUID> privateIds, Set<UUID> deniedIds) {}

    public ReferenceAccess referenceAccess(Set<UUID> references, UserAccount actor) {
        var origins = privateReferenceOrigins(references);
        var roots = origins.values().stream().flatMap(Set::stream).collect(java.util.stream.Collectors.toSet());
        var deniedRoots = deniedRoots(actor, roots);
        var denied = new HashSet<UUID>();
        origins.forEach((reference, parents) -> {
            if (parents.stream().anyMatch(deniedRoots::contains)) denied.add(reference);
        });
        return new ReferenceAccess(Set.copyOf(origins.keySet()), Set.copyOf(denied));
    }

    public List<InventoryAccessPolicy> referencedPolicies(Set<UUID> references) {
        var roots = privateReferenceOrigins(references).values().stream().flatMap(Set::stream)
                .collect(java.util.stream.Collectors.toSet());
        if (roots.isEmpty()) return List.of();
        return entityManager.createQuery("""
                select p from InventoryAccessPolicy p join fetch p.owner where
                    exists (select i.id from Item i where i.accessPolicy = p and i.id in :roots)
                    or exists (select l.id from StorageLocation l where l.accessPolicy = p and l.id in :roots)
                    or exists (select a.id from Assembly a where a.accessPolicy = p and a.id in :roots)
                order by p.id
                """, InventoryAccessPolicy.class).setParameter("roots", roots).getResultList();
    }

}

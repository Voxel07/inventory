package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryAccessGrant;
import org.ash.inventory.operations.internal.model.InventoryAccessGroup;
import org.ash.inventory.operations.internal.model.InventoryAccessLink;
import org.ash.inventory.operations.internal.model.InventoryAccessPolicy;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.platform.api.BusinessTime;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.TypedQuery;
import java.util.*;

@ApplicationScoped
public class InventoryAccessOrm extends EntityOrm {
    /** Scoped aggregate predicate: evaluated before ordering/paging, never enumerates denied ledger IDs. */
    public static String scope(String kind, String alias) {
        return " and function('inventory_resource_visible', '" + kind + "', " + alias
                + ".id, :accessActor, :accessAdmin, :accessPublic) = true";
    }
    /** Inline simple relationships so deep movement pages do not re-read each movement in PL/pgSQL. */
    public static String transactionScope(String tx, String source, String destination) {
        return " and " + visible(tx + ".item.accessPolicy")
                + " and (" + source + " is null or " + visible(source + ".accessPolicy") + ")"
                + " and (" + destination + " is null or " + visible(destination + ".accessPolicy") + ")"
                + " and (" + tx + ".order is null or function('inventory_resource_visible', 'order', " + tx + ".order.id, :accessActor, :accessAdmin, :accessPublic) = true)"
                + " and (" + tx + ".damageReport is null or function('inventory_resource_visible', 'damage', " + tx + ".damageReport.id, :accessActor, :accessAdmin, :accessPublic) = true)";
    }
    /**
     * Use this predicate before pagination; :accessActor/:accessAdmin/:accessPublic are bound below.
     * Public rows are organization data (not for tenants). Private rows need ownership, an offer for
     * use (organization members), or a direct or inherited grant; inherited grants and owners come
     * from the private locations listed in {@link InventoryAccessLink}. Mirrors {@link #granted}.
     */
    public static String visible(String policy) {
        return "((" + policy + " is null and :accessPublic = true) or :accessAdmin = true or exists (select p.id from InventoryAccessPolicy p where p = " + policy
                + " and (p.owner.id = :accessActor or (p.publicUse = true and :accessPublic = true)"
                + " or exists (select g.id from InventoryAccessGrant g where (g.policy = p"
                + " or exists (select k.id from InventoryAccessLink k where k.policy = p and k.ancestor = g.policy))"
                + " and (g.user.id = :accessActor or exists (select grp.id from InventoryAccessGroup grp"
                + " join grp.members member where grp = g.group and member.id = :accessActor)))"
                + " or exists (select k.id from InventoryAccessLink k where k.policy = p and k.ancestor.owner.id = :accessActor))))";
    }
    public static <T> TypedQuery<T> bind(TypedQuery<T> query, UserAccount actor) {
        return query.setParameter("accessAdmin", actor.role == DomainEnums.UserRole.admin)
                .setParameter("accessPublic", actor.role.atLeast(DomainEnums.UserRole.read_only))
                .setParameter("accessActor", actor.id);
    }
    public List<InventoryAccessGrant> grants(InventoryAccessPolicy policy) {
        return entityManager.createQuery("from InventoryAccessGrant g left join fetch g.user left join fetch g.group where g.policy = :policy", InventoryAccessGrant.class)
                .setParameter("policy", policy).getResultList();
    }
    public List<Object[]> policyViews(Collection<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return entityManager.createQuery("select p.id, p.owner.id, p.owner.name, p.revision, p.publicUse from InventoryAccessPolicy p where p.id in :ids", Object[].class)
                .setParameter("ids", ids).getResultList();
    }
    /**
     * Grants inherited from private locations:
     * (policy, location id, location name, grant user, user name, grant group, group name, can edit, actor is member).
     */
    public List<Object[]> inheritedGrantViews(Collection<UUID> ids, UUID actor) {
        if (ids.isEmpty()) return List.of();
        return entityManager.createQuery("""
                select k.policy.id, s.id, s.name, u.id, u.name, grp.id, grp.name, g.canEdit,
                    case when exists (select m.id from InventoryAccessGroup members join members.members m
                        where members = grp and m.id = :actor) then true else false end
                from InventoryAccessLink k join InventoryAccessGrant g on g.policy = k.ancestor
                    join StorageLocation s on s.accessPolicy = k.ancestor
                    left join g.user u left join g.group grp
                where k.policy.id in :ids
                """, Object[].class).setParameter("ids", ids).setParameter("actor", actor).getResultList();
    }
    /** Owners of the private locations a resource is stored in: (policy, location id, location name, owner id, owner name). */
    public List<Object[]> inheritedOwnerViews(Collection<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return entityManager.createQuery("""
                select k.policy.id, s.id, s.name, o.id, o.name
                from InventoryAccessLink k join StorageLocation s on s.accessPolicy = k.ancestor join k.ancestor.owner o
                where k.policy.id in :ids
                """, Object[].class).setParameter("ids", ids).getResultList();
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
        return entityManager.createQuery("from StorageLocation l left join fetch l.parent where l.id in :ids", StorageLocation.class)
                .setParameter("ids", ids).getResultList();
    }
    /** Direct or inherited grant, or ownership of a private location the resource is stored in. */
    public boolean granted(InventoryAccessPolicy policy, UserAccount actor, boolean edit) {
        boolean grant = !entityManager.createQuery("select g.id from InventoryAccessGrant g where (g.policy = :policy"
                + " or exists (select k.id from InventoryAccessLink k where k.policy = :policy and k.ancestor = g.policy))"
                + (edit ? " and g.canEdit = true" : "")
                + " and (g.user = :actor or exists (select grp.id from InventoryAccessGroup grp join grp.members member where grp = g.group and member = :actor))", UUID.class)
                .setParameter("policy", policy).setParameter("actor", actor).setMaxResults(1).getResultList().isEmpty();
        return grant || !entityManager.createQuery("select k.id from InventoryAccessLink k where k.policy = :policy and k.ancestor.owner = :actor", UUID.class)
                .setParameter("policy", policy).setParameter("actor", actor).setMaxResults(1).getResultList().isEmpty();
    }
    /** Locks the policies a resource inherits from, in id order (descendants lock after themselves). */
    public void lockAncestorPolicies(InventoryAccessPolicy policy) {
        entityManager.createQuery("select k.ancestor from InventoryAccessLink k where k.policy = :policy order by k.ancestor.id", InventoryAccessPolicy.class)
                .setParameter("policy", policy).getResultList().forEach(this::lock);
    }
    /** Replaces the inheritance links of {@code policy}. */
    public void replaceLinks(InventoryAccessPolicy policy, Collection<InventoryAccessPolicy> ancestors) {
        entityManager.createQuery("delete from InventoryAccessLink k where k.policy = :policy").setParameter("policy", policy).executeUpdate();
        for (var ancestor : new LinkedHashSet<>(ancestors)) {
            if (ancestor.equals(policy)) continue;
            var link = new InventoryAccessLink();
            link.policy = policy;
            link.ancestor = ancestor;
            entityManager.persist(link);
        }
    }
    public void deleteLinks(InventoryAccessPolicy policy) {
        entityManager.createQuery("delete from InventoryAccessLink k where k.policy = :policy or k.ancestor = :policy")
                .setParameter("policy", policy).executeUpdate();
    }
    public void deleteGrants(InventoryAccessPolicy policy) {
        entityManager.createQuery("delete from InventoryAccessGrant g where g.policy = :policy").setParameter("policy", policy).executeUpdate();
    }
    public List<InventoryAccessGroup> groups() {
        return entityManager.createQuery("select distinct g from InventoryAccessGroup g left join fetch g.members left join fetch g.owner order by g.name", InventoryAccessGroup.class).getResultList();
    }
    public List<InventoryAccessPolicy> lockGroupPolicies(UUID groupId) {
        var policies = entityManager.createQuery("select distinct p from InventoryAccessPolicy p where exists (select g.id from InventoryAccessGrant g where g.policy = p and g.group.id = :group) order by p.id", InventoryAccessPolicy.class)
                .setParameter("group", groupId).getResultList();
        policies.forEach(this::lock);
        return policies;
    }
    public void deleteGroupGrants(InventoryAccessGroup group) {
        entityManager.createQuery("delete from InventoryAccessGrant g where g.group = :group").setParameter("group", group).executeUpdate();
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
                .setParameter("item", item).setParameter("today", BusinessTime.today()).setMaxResults(1).getResultList().isEmpty();
    }
    public List<UserAccount> people() {
        return entityManager.createQuery("from UserAccount where active = true order by name, id", UserAccount.class).getResultList();
    }
    /**
     * One set-based authorization read per resource kind, independent of the number of policies. For
     * tenants public resources are denied roots as well.
     */
    private Set<UUID> deniedRoots(UserAccount actor, Set<UUID> candidates) {
        if (actor.role == DomainEnums.UserRole.admin || candidates != null && candidates.isEmpty()) return Set.of();
        boolean includePublic = !actor.role.atLeast(DomainEnums.UserRole.read_only);
        var roots = new HashSet<UUID>();
        for (String type : List.of("Item", "StorageLocation", "Assembly")) {
            var query = entityManager.createQuery("select r.id from " + type + " r where "
                    + (includePublic ? "1 = 1" : "r.accessPolicy is not null")
                    + " and not " + visible("r.accessPolicy")
                    + (candidates == null ? "" : " and r.id in :candidates"), UUID.class);
            if (candidates != null) query.setParameter("candidates", candidates);
            roots.addAll(bind(query, actor).getResultList());
        }
        return roots;
    }
    // Both traversal directions share the same evidence graph, including JSON
    // order references. UNION in the recursion also terminates cycles.
    private static final String REFERENCE_EDGES = """
                select item_id as source, id as target from asset_instances where item_id is not null
                union all select item_id as source, id as target from inventory_lots where item_id is not null
                union all select item_id as source, id as target from inventory_positions where item_id is not null
                union all select item_id as source, id as target from damage_reports where item_id is not null
                union all select item_id as source, id as target from maintenance_records where item_id is not null
                union all select item_id as source, id as target from runtime_entries where item_id is not null
                union all select item_id as source, id as target from maintenance_schedules where item_id is not null
                union all select item_id as source, id as target from equipment_commitments where item_id is not null
                union all select item_id as source, id as target from return_submissions where item_id is not null
                union all select item_id as source, id as target from member_requests where item_id is not null
                union all select item_id as source, id as target from custody_handover_lines where item_id is not null
                union all select item_id as source, id as target from stock_transactions where item_id is not null
                union all select item_id as source, id as target from order_lines where item_id is not null
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
                union all select pickup_location_id as source, id as target from orders where pickup_location_id is not null
                union all select damage_report_id as source, id as target from repair_cases where damage_report_id is not null
                union all select commitment_id as source, id as target from loan_arrangements where commitment_id is not null
                union all select item_id as source, assembly_id as target from assembly_items where item_id is not null
                union all select assembly_id as source, id as target from damage_reports where assembly_id is not null
                union all select source_location_id as source, id as target from order_lines where source_location_id is not null
                union all select source_assembly_id as source, id as target from order_lines where source_assembly_id is not null
                union all select id as source, order_id as target from order_lines where id is not null
                union all select id as source, count_session_id as target from inventory_count_lines where id is not null
                union all select id as source, transfer_id as target from inventory_transfer_lines where id is not null
                union all select id as source, purchase_order_id as target from purchase_order_lines where id is not null
                union all select id as source, goods_receipt_id as target from goods_receipt_lines where id is not null
                union all select id as source, handover_id as target from custody_handover_lines where id is not null
                union all select purchase_order_id as source, id as target from vendor_documents where purchase_order_id is not null
                union all select goods_receipt_id as source, id as target from vendor_documents where goods_receipt_id is not null
                union all select purchase_order_id as source, id as target from goods_receipts where purchase_order_id is not null
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
        return ancestorRoots(references, false);
    }

    /** {@code includePublic}: tenants must not see public roots either, so every item/location/assembly is a root. */
    private Map<UUID, Set<UUID>> ancestorRoots(Set<UUID> references, boolean includePublic) {
        if (references.isEmpty() || !includePublic && !privateRootsExist()) return Map.of();
        String filter = includePublic ? "" : " where access_policy_id is not null";
        String sql = "with recursive edges(source, target) as not materialized (" + REFERENCE_EDGES + "), "
            + "roots(id) as not materialized (select id from items" + filter
            + " union select id from storage_locations" + filter
            + " union select id from assemblies" + filter + "), " + """
            ancestors(reference, id) as (
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
        var origins = ancestorRoots(references, !actor.role.atLeast(DomainEnums.UserRole.read_only));
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

package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItem;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.ItemImage;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.StorageLocation;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Database access for the catalogue aggregate. */
@ApplicationScoped
public class CatalogOrm extends EntityOrm {


    /**
     * Server-side catalog filters. {@code locationIds} matches the default location, stocked positions and active
     * assets there; {@code mineOwner}/{@code mineItemIds} select owned private items and items in the actor's custody.
     */
    /**
     * {@code includeUntagged}: with {@code eventType}, items without any event tag match too (usable for every event).
     * {@code maintenanceAttention}: items with a calendar interval that are out of service, undated or due within the
     * calendar warning window.
     */
    public record ItemFilter(String search, String category, String eventType, boolean includeUntagged, List<UUID> locationIds,
            List<UUID> ids, UUID mineOwner, List<UUID> mineItemIds, String sort, boolean maintenanceAttention) {
        public static ItemFilter search(String search, String category) {
            return new ItemFilter(search, category, null, false, List.of(), List.of(), null, List.of(), null, false);
        }
    }

    private static final Map<String, String> ITEM_SORTS = Map.of(
            "name", "lower(i.name), i.id", "-name", "lower(i.name) desc, i.id desc",
            "sku", "lower(i.sku), i.id", "-sku", "lower(i.sku) desc, i.id desc",
            "category", "lower(i.category), lower(i.name), i.id", "-category", "lower(i.category) desc, lower(i.name) desc, i.id desc",
            "created", "i.createdAt, i.id", "-created", "i.createdAt desc, i.id desc");

    /** One page of visible active items; the access-policy predicate and every filter run before pagination. */
    public List<Item> items(ItemFilter filter, int offset, int limit) {
        var where = new StringBuilder(" where i.active = true").append(visibility());
        var parameters = new LinkedHashMap<String, Object>();
        if (filter.search() != null && !filter.search().isBlank()) {
            where.append(" and (lower(i.name) like :search or lower(i.sku) like :search or lower(i.category) like :search)");
            parameters.put("search", "%" + filter.search().trim().toLowerCase(Locale.ROOT) + "%");
        }
        if (filter.category() != null && !filter.category().isBlank()) {
            where.append(" and lower(i.category) = :category");
            parameters.put("category", filter.category().trim().toLowerCase(Locale.ROOT));
        }
        if (filter.eventType() != null && !filter.eventType().isBlank()) {
            where.append(filter.includeUntagged()
                    ? " and (cast(i.eventTags as String) like :eventType escape '!' or cast(i.eventTags as String) = '[]')"
                    : " and cast(i.eventTags as String) like :eventType escape '!'");
            parameters.put("eventType", jsonElementPattern(filter.eventType()));
        }
        if (!filter.locationIds().isEmpty()) {
            where.append(" and (i.storageLocation.id in :locations"
                    + " or exists (select p.id from InventoryPosition p where p.item = i and p.location.id in :locations and p.quantityOnHand > 0)"
                    + " or exists (select a.id from AssetInstance a where a.item = i and a.active = true and a.currentLocation.id in :locations"
                    + " and a.availabilityStatus not in (:gone)))");
            // A location filter covers everything stored below it.
            parameters.put("locations", filter.locationIds().stream().flatMap(id -> subtreeIds(id).stream()).collect(java.util.stream.Collectors.toSet()));
            parameters.put("gone", List.of(DomainEnums.AssetState.lost, DomainEnums.AssetState.written_off));
        }
        if (filter.maintenanceAttention()) {
            where.append(" and i.maintenanceIntervalDays > 0 and (i.outOfService = true or i.nextMaintenanceDue is null or i.nextMaintenanceDue <= :warnUntil)");
            parameters.put("warnUntil", org.ash.inventory.helper.BusinessTime.today().plusDays(org.ash.inventory.service.MaintenancePolicy.CALENDAR_WARNING_DAYS));
        }
        if (!filter.ids().isEmpty()) {
            where.append(" and i.id in :ids");
            parameters.put("ids", filter.ids());
        }
        if (filter.mineOwner() != null) {
            where.append(filter.mineItemIds().isEmpty() ? " and ap.owner.id = :mineOwner"
                    : " and (ap.owner.id = :mineOwner or i.id in :mineItems)");
            parameters.put("mineOwner", filter.mineOwner());
            if (!filter.mineItemIds().isEmpty()) parameters.put("mineItems", filter.mineItemIds());
        }
        String order = ITEM_SORTS.getOrDefault(filter.sort() == null ? "-created" : filter.sort(), ITEM_SORTS.get("-created"));
        // Only to-one associations are fetched, so rows stay unique and paging runs in SQL.
        var query = visible(entityManager.createQuery("select i from Item i left join i.accessPolicy ap"
                + " left join fetch i.storageLocation sl left join fetch sl.parent"
                + " left join fetch i.returnLocation rl left join fetch rl.parent"
                + where + " order by " + order, Item.class));
        parameters.forEach(query::setParameter);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    /** LIKE pattern matching one string element of a JSON array column rendered as text. */
    private static String jsonElementPattern(String value) {
        String json = "\"" + value.trim().replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
        return "%" + json.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    private static String visibility() {
        return " and " + InventoryAccessOrm.visible("i.accessPolicy");
    }

    private <T> jakarta.persistence.TypedQuery<T> visible(jakarta.persistence.TypedQuery<T> query) {
        return InventoryAccessOrm.bind(query, accessActor.current());
    }

    public List<Item> itemsByIds(List<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return entityManager.createQuery("from Item i where i.id in :ids", Item.class).setParameter("ids", ids).getResultList();
    }

    public List<UUID> visibleItemIds() {
        return visible(entityManager.createQuery("select i.id from Item i where i.active = true" + visibility(), UUID.class)).getResultList();
    }

    public List<String> categories() {
        return visible(entityManager.createQuery("select distinct i.category from Item i where i.active = true"
                + " and i.category is not null" + visibility() + " order by i.category", String.class)).getResultList();
    }

    /** One page of visible active locations, optionally within one location's subtree. */
    public List<StorageLocation> locations(UUID subtreeId, int offset, int limit) {
        var query = entityManager.createQuery("from StorageLocation l left join fetch l.parent where l.active = true and "
                + InventoryAccessOrm.visible("l.accessPolicy") + (subtreeId == null ? "" : " and l.id in :subtree")
                + " order by lower(l.fullCode), l.id", StorageLocation.class);
        if (subtreeId != null) query.setParameter("subtree", subtreeIds(subtreeId));
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public record VisibleCounts(long items, long serializedAssets, long locations) {}
    public VisibleCounts visibleCounts() {
        long items = visible(entityManager.createQuery("select count(i) from Item i where i.active = true" + visibility(), Long.class)).getSingleResult();
        long assets = visible(entityManager.createQuery("select count(a) from AssetInstance a join a.item i where a.active = true and i.active = true"
                + visibility(), Long.class)).getSingleResult();
        long locations = InventoryAccessOrm.bind(entityManager.createQuery("select count(l) from StorageLocation l where l.active = true and "
                + InventoryAccessOrm.visible("l.accessPolicy"), Long.class), accessActor.current()).getSingleResult();
        return new VisibleCounts(items, assets, locations);
    }

    public long upcomingEventCount(LocalDate today) {
        return entityManager.createQuery("select count(e) from EventOccurrence e where e.startDate >= :today and lower(e.status) <> 'cancelled'", Long.class)
                .setParameter("today", today).getSingleResult();
    }

    /** One page of visible locations, newest first; access policy and filters apply before pagination. */
    public List<StorageLocation> locations(boolean includeInactive, String search, UUID subtreeId, int offset, int limit) {
        var query = entityManager.createQuery("from StorageLocation l left join fetch l.parent where "
                + InventoryAccessOrm.visible("l.accessPolicy") + (includeInactive ? "" : " and l.active = true")
                + (search == null || search.isBlank() ? "" : " and (lower(l.name) like :search or lower(l.fullCode) like :search or lower(coalesce(l.description, '')) like :search)")
                + (subtreeId == null ? "" : " and l.id in :subtree")
                + " order by lower(l.fullCode), l.id", StorageLocation.class);
        if (search != null && !search.isBlank()) query.setParameter("search", "%" + search.trim().toLowerCase(Locale.ROOT) + "%");
        if (subtreeId != null) query.setParameter("subtree", subtreeIds(subtreeId));
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<StorageLocation> locationsIn(java.util.Collection<UUID> ids) {
        return entityManager.createQuery("from StorageLocation l left join fetch l.parent where l.id in :ids order by lower(l.fullCode), l.id", StorageLocation.class)
                .setParameter("ids", ids).getResultList();
    }

    /** Orders, movements, returns and owner commitments are history that must keep their event. */
    public boolean hasEventHistory(UUID eventId) {
        for (String query : List.of(
                "select o.id from InventoryOrder o where o.eventOccurrence.id = :id",
                "select o.id from PurchaseOrder o where o.eventOccurrence.id = :id",
                "select t.id from StockTransaction t where t.eventOccurrence.id = :id",
                "select r.id from ReturnSubmission r where r.eventOccurrence.id = :id",
                "select c.id from EquipmentCommitment c where c.event.id = :id")) {
            if (!entityManager.createQuery(query, UUID.class)
                    .setParameter("id", eventId).setMaxResults(1).getResultList().isEmpty()) return true;
        }
        return false;
    }

    /** Planning overrides belong to the event's plan and go with it. */
    public void deletePlanningOverrides(UUID eventId) {
        entityManager.createQuery("delete from PlanningOverride p where p.event.id = :id")
                .setParameter("id", eventId).executeUpdate();
    }

    /**
     * One page of visible active assemblies: a private assembly needs its own grant, and every assembly needs every
     * component visible and active. Both predicates run before pagination.
     */
    public List<Assembly> assemblies(String search, String eventTag, UUID mineOwner, int offset, int limit) {
        var query = entityManager.createQuery("from Assembly a where a.active = true and " + InventoryAccessOrm.visible("a.accessPolicy")
                + " and not exists (select ai.quantity from AssemblyItem ai join ai.item component where ai.assembly = a and (component.active = false or not "
                + InventoryAccessOrm.visible("component.accessPolicy") + "))"
                + (search == null || search.isBlank() ? "" : " and (lower(a.name) like :search or lower(coalesce(a.category, '')) like :search or lower(coalesce(a.subcategory, '')) like :search)")
                + (eventTag == null || eventTag.isBlank() ? "" : " and cast(a.eventTags as String) like :eventTag escape '!'")
                + (mineOwner == null ? "" : " and a.accessPolicy.owner.id = :mineOwner")
                + " order by a.createdAt desc, a.id", Assembly.class);
        if (search != null && !search.isBlank()) query.setParameter("search", "%" + search.trim().toLowerCase(Locale.ROOT) + "%");
        if (eventTag != null && !eventTag.isBlank()) query.setParameter("eventTag", jsonElementPattern(eventTag));
        if (mineOwner != null) query.setParameter("mineOwner", mineOwner);
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<EventOccurrence> events(String eventType) {
        if (eventType == null || eventType.isBlank()) {
            return entityManager.createQuery("from EventOccurrence e order by e.startDate desc", EventOccurrence.class).getResultList();
        }
        return entityManager.createQuery("from EventOccurrence e where e.eventType = :eventType order by e.startDate desc", EventOccurrence.class)
                .setParameter("eventType", eventType)
                .getResultList();
    }

    public List<Faction> factions(String eventType) {
        if (eventType == null || eventType.isBlank()) {
            return entityManager.createQuery("from Faction f where f.active = true order by f.eventType, f.name", Faction.class).getResultList();
        }
        return entityManager.createQuery("from Faction f where f.active = true and f.eventType = :eventType order by f.name", Faction.class)
                .setParameter("eventType", eventType)
                .getResultList();
    }

    public EventOccurrence findEvent(String eventType, LocalDate date) {
        return entityManager.createQuery("from EventOccurrence e where e.eventType = :eventType and e.startDate = :date", EventOccurrence.class)
                .setParameter("eventType", eventType)
                .setParameter("date", date)
                .getResultStream().findFirst().orElse(null);
    }

    /** Event types that have an active faction or an event occurrence. */
    public java.util.SortedSet<String> eventTypes() {
        var result = new java.util.TreeSet<String>(entityManager.createQuery(
                "select distinct f.eventType from Faction f where f.active = true", String.class).getResultList());
        result.addAll(entityManager.createQuery("select distinct e.eventType from EventOccurrence e", String.class).getResultList());
        return result;
    }

    public Faction findFaction(String eventType, String lowerCaseName) {
        return entityManager.createQuery("from Faction f where f.eventType = :eventType and lower(f.name) = :name", Faction.class)
                .setParameter("eventType", eventType)
                .setParameter("name", lowerCaseName)
                .getResultStream().findFirst().orElse(null);
    }

    public List<AssemblyItem> assemblyItems(Assembly assembly) {
        return entityManager.createQuery("from AssemblyItem ai join fetch ai.item i left join fetch i.storageLocation sl left join fetch sl.parent left join fetch i.returnLocation rl left join fetch rl.parent where ai.assembly = :assembly", AssemblyItem.class)
                .setParameter("assembly", assembly).getResultList();
    }

    public java.util.Map<UUID, List<AssemblyItem>> assemblyItems(List<Assembly> assemblies) {
        if (assemblies == null || assemblies.isEmpty()) {
            return java.util.Map.of();
        }
        var items = entityManager.createQuery(
                "from AssemblyItem ai join fetch ai.item i left join fetch i.storageLocation sl left join fetch sl.parent left join fetch i.returnLocation rl left join fetch rl.parent where ai.assembly in :assemblies", AssemblyItem.class)
                .setParameter("assemblies", assemblies)
                .getResultList();
        return items.stream().collect(java.util.stream.Collectors.groupingBy(ai -> ai.assembly.id));
    }

    public List<ItemImage> itemImages(Item item) {
        return entityManager.createQuery("from ItemImage image where image.item = :item order by image.displayOrder", ItemImage.class)
                .setParameter("item", item).getResultList();
    }

    public java.util.Map<String, String> itemNames(java.util.Collection<UUID> ids) {
        var result = new java.util.LinkedHashMap<String, String>();
        if (ids.isEmpty()) return result;
        for (var row : entityManager.createQuery("select i.id, i.name from Item i where i.id in :ids", Object[].class)
                .setParameter("ids", ids).getResultList()) result.put(row[0].toString(), (String) row[1]);
        return result;
    }

    public java.util.Map<UUID, List<ItemImage>> itemImages(List<Item> items) {
        if (items == null || items.isEmpty()) {
            return java.util.Map.of();
        }
        var images = entityManager.createQuery(
                "from ItemImage image where image.item in :items order by image.item.id, image.displayOrder", ItemImage.class)
                .setParameter("items", items)
                .getResultList();
        return images.stream().collect(java.util.stream.Collectors.groupingBy(img -> img.item.id));
    }


    public void deleteItemImages(Item item) {
        entityManager.createQuery("delete from ItemImage image where image.item = :item")
                .setParameter("item", item).executeUpdate();
    }

    public List<AssetInstance> assetInstances(Item item) {
        return entityManager.createQuery("from AssetInstance a where a.item = :item and a.active = true order by a.assetCode asc", AssetInstance.class)
                .setParameter("item", item).getResultList();
    }

    public List<AssetInstance> assetInstances(Item item, int offset, int limit) {
        return assetInstances(item, null, offset, limit);
    }

    public List<AssetInstance> assetInstances(Item item, DomainEnums.AssetState status, int offset, int limit) {
        var query = entityManager.createQuery("from AssetInstance a left join fetch a.currentLocation left join fetch a.currentCustodian"
                + " where a.item = :item and a.active = true" + (status == null ? "" : " and a.availabilityStatus = :status")
                + " order by a.assetCode asc, a.id", AssetInstance.class).setParameter("item", item);
        if (status != null) query.setParameter("status", status);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    /** Custody, return and order obligations that must settle before an item may be retired. */
    public List<String> openObligations(Item item) {
        var row = (Object[]) entityManager.createNativeQuery("""
                select
                    exists (select 1 from stock_transactions t
                        where t.item_id = :item and t.order_id is null and t.related_entity_type is null
                            and (t.type in ('checkout', 'checkin', 'consumed') or (t.type = 'written_off' and t.custody_write_off))
                        group by t.user_id, t.event_occurrence_id, t.asset_instance_id
                        having sum(case when t.type = 'checkout' then t.quantity else -t.quantity end) > 0),
                    exists (select 1 from order_lines l join orders o on o.id = l.order_id
                        where l.item_id = :item and (o.status not in ('returned', 'closed', 'cancelled')
                            or l.handed_over_quantity - l.returned_quantity - l.consumed_quantity
                                - l.damaged_quantity - l.written_off_quantity > 0)),
                    exists (select 1 from return_submissions r where r.item_id = :item and r.status = 'pending'),
                    exists (select 1 from stock_reservations r where r.item_id = :item and r.status in ('active', 'partially_released'))
                """).setParameter("item", item.id).getSingleResult();
        var labels = List.of("outstanding direct custody", "open orders",
                "pending returns", "active reservations");
        var result = new ArrayList<String>();
        for (int i = 0; i < labels.size(); i++) if (Boolean.TRUE.equals(row[i])) result.add(labels.get(i));
        return result;
    }

    public long countAssets(Item item) {
        return entityManager.createQuery("select count(a) from AssetInstance a where a.item = :item and a.active = true", Long.class)
                .setParameter("item", item).getSingleResult();
    }

    public long countTransactions(Item item) {
        return entityManager.createQuery("select count(tx) from StockTransaction tx where tx.item = :item", Long.class)
                .setParameter("item", item).getSingleResult();
    }

    public AssetInstance findAssetByCode(String code) {
        if (code == null || code.isBlank()) return null;
        return entityManager.createQuery("from AssetInstance a where lower(a.assetCode) = :code and a.active = true", AssetInstance.class)
                .setParameter("code", code.trim().toLowerCase(Locale.ROOT))
                .getResultStream().findFirst().orElse(null);
    }

    public boolean skuExists(String sku) {
        return !entityManager.createQuery("select i.id from Item i where i.sku = :sku", UUID.class)
                .setParameter("sku", sku).setMaxResults(1).getResultList().isEmpty();
    }

    /** Any unit, active or retired, holding {@code code}; codes stay unique across write-offs. */
    public AssetInstance assetWithCode(String code) {
        return entityManager.createQuery("from AssetInstance a where lower(a.assetCode) = :code", AssetInstance.class)
                .setParameter("code", code.trim().toLowerCase(Locale.ROOT)).setMaxResults(1).getResultStream().findFirst().orElse(null);
    }

    public boolean assetCodeExists(String code) {
        if (code == null || code.isBlank()) return false;
        return entityManager.createQuery("select count(a) from AssetInstance a where lower(a.assetCode) = :code", Long.class)
                .setParameter("code", code.trim().toLowerCase(Locale.ROOT))
                .getSingleResult() > 0;
    }
}

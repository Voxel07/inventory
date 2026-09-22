package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
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
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Database access for the catalogue aggregate. */
@ApplicationScoped
public class CatalogOrm {
    private final EntityManager entityManager;

    public CatalogOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public List<Item> items(String search, UUID actorId, List<String> actorGroups, boolean manager, int offset, int limit) {
        String visibility = " and (:manager = true or i.visibilityScope in (:publicScopes)"
                + " or i.assignedUser.id = :actorId or i.assignedGroup in (:actorGroups))";
        String filtering = search == null || search.isBlank() ? ""
                : " and (lower(i.name) like :search or lower(i.sku) like :search or lower(i.category) like :search)";
        var query = entityManager.createQuery(
                "select distinct i from Item i left join fetch i.storageLocation left join fetch i.returnLocation"
                        + " left join fetch i.assignedUser where i.active = true" + visibility + filtering
                        + " order by i.createdAt desc, i.id desc", Item.class)
                .setParameter("manager", manager)
                .setParameter("publicScopes", List.of(DomainEnums.ItemVisibilityScope.global, DomainEnums.ItemVisibilityScope.event))
                .setParameter("actorId", actorId)
                .setParameter("actorGroups", actorGroups == null || actorGroups.isEmpty() ? List.of("__none__") : actorGroups)
                .setFirstResult(offset).setMaxResults(limit);
        if (!filtering.isEmpty()) query.setParameter("search", "%" + search.toLowerCase(Locale.ROOT) + "%");
        return query.getResultList();
    }

    public List<StorageLocation> locations() {
        return entityManager.createQuery("from StorageLocation l where l.active = true order by l.createdAt desc", StorageLocation.class).getResultList();
    }

    public List<Assembly> assemblies() {
        return entityManager.createQuery("from Assembly a order by a.createdAt desc", Assembly.class).getResultList();
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

    public Faction findFaction(String eventType, String lowerCaseName) {
        return entityManager.createQuery("from Faction f where f.eventType = :eventType and lower(f.name) = :name", Faction.class)
                .setParameter("eventType", eventType)
                .setParameter("name", lowerCaseName)
                .getResultStream().findFirst().orElse(null);
    }

    public List<AssemblyItem> assemblyItems(Assembly assembly) {
        return entityManager.createQuery("from AssemblyItem ai join fetch ai.item i left join fetch i.storageLocation where ai.assembly = :assembly", AssemblyItem.class)
                .setParameter("assembly", assembly).getResultList();
    }

    public java.util.Map<UUID, List<AssemblyItem>> assemblyItems(List<Assembly> assemblies) {
        if (assemblies == null || assemblies.isEmpty()) {
            return java.util.Map.of();
        }
        var items = entityManager.createQuery(
                "from AssemblyItem ai join fetch ai.item i left join fetch i.storageLocation where ai.assembly in :assemblies", AssemblyItem.class)
                .setParameter("assemblies", assemblies)
                .getResultList();
        return items.stream().collect(java.util.stream.Collectors.groupingBy(ai -> ai.assembly.id));
    }

    public List<ItemImage> itemImages(Item item) {
        return entityManager.createQuery("from ItemImage image where image.item = :item order by image.displayOrder", ItemImage.class)
                .setParameter("item", item).getResultList();
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

    public <T> T find(Class<T> type, UUID id) { return entityManager.find(type, id); }
    public <T> T findLocked(Class<T> type, UUID id) { return entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE); }
    public void persist(Object entity) { entityManager.persist(entity); }
    public void remove(Object entity) { entityManager.remove(entity); }

    public void deleteItemImages(Item item) {
        entityManager.createQuery("delete from ItemImage image where image.item = :item")
                .setParameter("item", item).executeUpdate();
    }

    public void deleteAssemblyItems(Assembly assembly) {
        entityManager.createQuery("delete from AssemblyItem item where item.assembly = :assembly")
                .setParameter("assembly", assembly).executeUpdate();
    }

    public void clearActiveLocationAssignments(StorageLocation location) {
        entityManager.createQuery("update Item i set i.storageLocation = null where i.storageLocation = :location")
                .setParameter("location", location).executeUpdate();
        entityManager.createQuery("update Item i set i.returnLocation = null where i.returnLocation = :location")
                .setParameter("location", location).executeUpdate();
        entityManager.createQuery("update AssetInstance a set a.currentLocation = null where a.currentLocation = :location")
                .setParameter("location", location).executeUpdate();
    }

    public List<AssetInstance> assetInstances(Item item) {
        return entityManager.createQuery("from AssetInstance a where a.item = :item and a.active = true order by a.assetCode asc", AssetInstance.class)
                .setParameter("item", item).getResultList();
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

    public boolean assetCodeExists(String code) {
        if (code == null || code.isBlank()) return false;
        return entityManager.createQuery("select count(a) from AssetInstance a where lower(a.assetCode) = :code", Long.class)
                .setParameter("code", code.trim().toLowerCase(Locale.ROOT))
                .getSingleResult() > 0;
    }
}

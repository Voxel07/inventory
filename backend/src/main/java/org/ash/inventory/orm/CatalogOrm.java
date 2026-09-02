package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItem;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.ItemImage;
import org.ash.inventory.model.StorageLocation;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Database access for the catalogue aggregate. */
@ApplicationScoped
public class CatalogOrm {
    @Inject EntityManager entityManager;

    public List<Item> items(String search) {
        if (search == null || search.isBlank()) {
            return entityManager.createQuery("from Item i where i.active = true order by i.createdAt desc", Item.class).getResultList();
        }
        return entityManager.createQuery("from Item i where i.active = true and lower(i.name) like :search order by i.name", Item.class)
                .setParameter("search", "%" + search.toLowerCase(Locale.ROOT) + "%")
                .getResultList();
    }

    public List<StorageLocation> locations() {
        return entityManager.createQuery("from StorageLocation l order by l.createdAt desc", StorageLocation.class).getResultList();
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
        return entityManager.createQuery("from AssemblyItem ai where ai.assembly = :assembly", AssemblyItem.class)
                .setParameter("assembly", assembly).getResultList();
    }

    public List<ItemImage> itemImages(Item item) {
        return entityManager.createQuery("from ItemImage image where image.item = :item order by image.displayOrder", ItemImage.class)
                .setParameter("item", item).getResultList();
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

    public long countItemsAt(StorageLocation location) {
        return entityManager.createQuery("select count(i) from Item i where i.storageLocation = :location", Long.class)
                .setParameter("location", location).getSingleResult();
    }
}

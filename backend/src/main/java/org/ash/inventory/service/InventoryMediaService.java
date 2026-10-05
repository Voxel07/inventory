package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.InventoryMediaOrm;
import org.ash.inventory.resource.ApiException;
import java.util.*;

@ApplicationScoped @Transactional
public class InventoryMediaService {
    @Inject InventoryMediaOrm orm;
    @Inject ActorService actors;
    @Inject CatalogService catalog;
    @Inject PrivacyProjectionService privacy;
    @org.eclipse.microprofile.config.inject.ConfigProperty(name = "inventory.media.max-staged-per-user", defaultValue = "50")
    int maxStagedPerUser;

    public void register(String key) {
        var value = new InventoryMediaObject(); value.objectKey = key; value.uploader = actors.current(); orm.persist(value);
    }
    /** Per-user quota for uploads that are not attached to a resource yet. */
    public void requireUploadQuota() {
        if (orm.stagedCount(actors.current()) >= maxStagedPerUser)
            throw new ApiException(429, "Too many pending uploads; attach or delete existing uploads first");
    }
    /** Abandoned staged uploads older than the cutoff (no actor context; used by the purge job). */
    public List<String> abandonedStaged(java.time.Instant cutoff, int limit) { return orm.stagedKeysBefore(cutoff, limit); }
    public void forgetStaged(String key) { orm.deleteStagedRecord(key); }
    public void requireStaged(String key) {
        var value = object(key);
        orm.lock(value); orm.refresh(value);
        if (value.resourceType != null || !value.uploader.id.equals(actors.current().id)) throw ApiException.notFound("Media not found");
    }
    public void attach(String source, String destination, String type, UUID id) {
        requireStaged(source); var value = object(source);
        value.objectKey = destination; value.resourceType = type; value.resourceId = id;
    }
    public void requireAttached(String key, String type, UUID id) {
        var value = object(key);
        if (!Objects.equals(value.resourceType, type) || !Objects.equals(value.resourceId, id)) throw ApiException.badRequest("Media belongs to a different resource");
        requireRead(key);
    }
    public void requireRead(String key) {
        var value = object(key);
        if (value.resourceType == null) { requireStaged(key); return; }
        if (privacy.denied(value.resourceId)) throw ApiException.notFound("Media not found");
        switch (value.resourceType) {
            case "items" -> actors.requireItemAccess(orm.find(Item.class, value.resourceId));
            case "locations" -> actors.requireLocationAccess(orm.find(StorageLocation.class, value.resourceId), false);
            case "returns" -> { var r = orm.find(ReturnSubmission.class, value.resourceId); if (r == null) throw ApiException.notFound("Media not found"); actors.requireItemAccess(r.item); }
            case "maintenance" -> { var r = orm.find(MaintenanceRecord.class, value.resourceId); if (r == null) throw ApiException.notFound("Media not found"); actors.requireItemAccess(r.item); }
            case "assemblies" -> { var a = orm.find(Assembly.class, value.resourceId); if (a == null || !catalog.canViewAssembly(a)) throw ApiException.notFound("Media not found"); }
            case "vendor-documents" -> actors.requireWarehouse();
            default -> throw ApiException.notFound("Media not found");
        }
    }
    private InventoryMediaObject object(String key) {
        var value = orm.byKey(key); if (value == null) throw ApiException.notFound("Media not found"); return value;
    }
}

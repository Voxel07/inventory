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
    public void register(String key) {
        var value = new InventoryMediaObject(); value.objectKey = key; value.uploader = actors.current(); orm.persist(value);
    }
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
        if (privacy.deniedIds().contains(value.resourceId.toString())) throw ApiException.notFound("Media not found");
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

package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.Assembly;
import org.ash.inventory.operations.internal.model.CustodyHandover;
import org.ash.inventory.operations.internal.model.InventoryMediaObject;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.MaintenanceRecord;
import org.ash.inventory.operations.internal.model.ReturnSubmission;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.persistence.CatalogOrm;
import org.ash.inventory.operations.internal.persistence.InventoryMediaOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.util.*;

@ApplicationScoped @Transactional
public class InventoryMediaService {
    @Inject InventoryMediaOrm orm;
    @Inject ActorService actors;
    @Inject org.ash.inventory.operations.internal.persistence.CatalogOrm catalogFacts;
    @Inject InventoryAccessService accessViews;
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
    public record Abandoned(String key,UUID lease) {}
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<Abandoned> claimAbandoned(java.time.Instant cutoff,int limit) {
        var ids=orm.claimStaged(cutoff,limit);var result=new ArrayList<Abandoned>();
        for(var value:ids){value.purgeLease=UUID.randomUUID();value.purgeLeaseUntil=java.time.Instant.now().plusSeconds(300);result.add(new Abandoned(value.objectKey,value.purgeLease));}
        return result;
    }
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void purged(Abandoned claim){orm.deleteClaimed(claim.key(),claim.lease());}
    public void forgetStaged(String key) { orm.deleteStagedRecord(key); }
    /** Drops the registry row of an object that is deleted with the current transaction. */
    public void forget(String key) { orm.deleteRecord(key); }
    public void requireStaged(String key) {
        var value = object(key);
        orm.lock(value); orm.refresh(value);
        if (value.resourceType != null || value.purgeLease != null || !value.uploader.id.equals(actors.current().id)) throw ApiException.notFound("Media not found");
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
            case "handovers" -> { var h = orm.find(CustodyHandover.class, value.resourceId); if (h == null) throw ApiException.notFound("Media not found"); actors.requireReader(); if (privacy.denied(h.order.id)) throw ApiException.notFound("Media not found"); }
            case "items" -> actors.requireItemAccess(orm.find(Item.class, value.resourceId));
            case "locations" -> actors.requireLocationAccess(orm.find(StorageLocation.class, value.resourceId), false);
            case "returns" -> { var r = orm.find(ReturnSubmission.class, value.resourceId); if (r == null) throw ApiException.notFound("Media not found"); actors.requireItemAccess(r.item); }
            case "maintenance" -> { var r = orm.find(MaintenanceRecord.class, value.resourceId); if (r == null) throw ApiException.notFound("Media not found"); actors.requireItemAccess(r.item); }
            case "assemblies" -> { var a = orm.find(Assembly.class, value.resourceId); if (a == null || !a.active || !accessViews.projectionAllows(a.accessPolicy) || catalogFacts.assemblyItems(a).stream().anyMatch(c -> !c.item.active || !actors.canViewItem(c.item, actors.current()))) throw ApiException.notFound("Media not found"); }
            case "vendor-documents" -> actors.requireWarehouse();
            default -> throw ApiException.notFound("Media not found");
        }
    }
    private InventoryMediaObject object(String key) {
        var value = orm.byKey(key); if (value == null) throw ApiException.notFound("Media not found"); return value;
    }
}

package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.contract.dto.PurchasingDtos;
import org.ash.inventory.operations.internal.model.Vendor;
import org.ash.inventory.operations.internal.model.VendorItemSource;
import org.ash.inventory.operations.internal.model.VendorSourceScan;
import org.ash.inventory.operations.internal.persistence.PurchasingOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Suppliers derived from item purchase links. A manual scan groups every organization item link by shop host and
 * assigns it to the supplier of that host: one generated earlier, a supplier whose website or name is that host, or a
 * new generated supplier. Each scan replaces the previous item list; suppliers themselves are never removed.
 */
@ApplicationScoped
public class VendorSourceService {
    static final String GENERATED_NOTE = "Generated from item purchase links";

    private final PurchasingOrm orm;
    private final ActorService actors;
    private final DomainEventService events;

    public VendorSourceService(PurchasingOrm orm, ActorService actors, DomainEventService events) {
        this.orm = orm;
        this.actors = actors;
        this.events = events;
    }

    @Transactional
    public PurchasingDtos.VendorSourcesResponse sources() {
        actors.requireWarehouse();
        return view();
    }

    @Transactional
    @PrivateInventoryCommand
    public PurchasingDtos.VendorSourcesResponse scan() {
        actors.requireWarehouse();
        var actor = actors.current();
        orm.lockVendorSourceScan();
        // Ordered active and preferred first, so a host shared by several suppliers resolves to the most useful one.
        var vendors = orm.allVendors();
        Map<String, Vendor> generated = new HashMap<>(), byWebsite = new HashMap<>(), byName = new HashMap<>();
        for (var vendor : vendors) {
            if (vendor.sourceHost != null) generated.putIfAbsent(vendor.sourceHost, vendor);
            var website = websiteHost(vendor.website);
            if (website != null) byWebsite.putIfAbsent(website, vendor);
            byName.putIfAbsent(vendor.name.trim().toLowerCase(Locale.ROOT), vendor);
        }
        orm.removeVendorItemSources();
        var scan = new VendorSourceScan();
        scan.actor = actor;
        for (var item : orm.itemsWithPurchaseLinks()) {
            var host = PurchaseLinks.host(item.purchaseUrl);
            if (host == null) {
                scan.skippedItems++;
                continue;
            }
            var vendor = generated.get(host);
            if (vendor == null) vendor = byWebsite.get(host);
            if (vendor == null) vendor = byName.get(host);
            if (vendor == null) {
                vendor = new Vendor();
                vendor.name = host;
                vendor.website = "https://" + host;
                vendor.sourceHost = host;
                vendor.internalNotes = GENERATED_NOTE;
                orm.persist(vendor);
                generated.put(host, vendor);
                byName.put(host, vendor);
                scan.createdVendors++;
                events.record("vendor.created", "vendor", vendor.id, actor.id, null, Map.of("name", vendor.name, "sourceHost", host));
            }
            var source = new VendorItemSource();
            source.vendor = vendor;
            source.item = item;
            source.url = item.purchaseUrl;
            orm.persist(source);
            scan.linkedItems++;
        }
        orm.persist(scan);
        events.record("vendor.sources_scanned", "vendor_source_scan", scan.id, actor.id, null,
                Map.of("linkedItems", scan.linkedItems, "skippedItems", scan.skippedItems, "createdVendors", scan.createdVendors));
        orm.flush();
        return view();
    }

    private PurchasingDtos.VendorSourcesResponse view() {
        var scan = orm.lastVendorSourceScan();
        Map<UUID, Vendor> vendors = new LinkedHashMap<>();
        Map<UUID, List<PurchasingDtos.VendorSourceItem>> items = new LinkedHashMap<>();
        for (VendorItemSource source : orm.vendorItemSources()) {
            vendors.putIfAbsent(source.vendor.id, source.vendor);
            items.computeIfAbsent(source.vendor.id, ignored -> new ArrayList<>()).add(new PurchasingDtos.VendorSourceItem(
                    source.item.id, source.item.sku, source.item.name, source.url, source.item.purchaseUrl));
        }
        var groups = vendors.values().stream().map(vendor -> new PurchasingDtos.VendorSourceGroup(vendor.id, vendor.name,
                vendor.sourceHost != null ? vendor.sourceHost : PurchaseLinks.host(items.get(vendor.id).getFirst().url()),
                vendor.sourceHost != null, vendor.active, items.get(vendor.id))).toList();
        return new PurchasingDtos.VendorSourcesResponse(scan == null ? null : scan.createdAt,
                scan == null ? null : scan.actor.name, scan == null ? 0 : scan.linkedItems, scan == null ? 0 : scan.skippedItems,
                scan == null ? 0 : scan.createdVendors, orm.changedPurchaseLinks(), groups);
    }

    /** Website of a hand-entered supplier; a bare domain such as {@code shop.example} counts as well. */
    private static String websiteHost(String website) {
        if (website == null || website.isBlank()) return null;
        var value = website.trim();
        return PurchaseLinks.host(value.contains("://") ? value : "https://" + value);
    }
}

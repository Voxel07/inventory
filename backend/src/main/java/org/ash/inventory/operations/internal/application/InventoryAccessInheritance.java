package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.InventoryAccessPolicy;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.persistence.InventoryAccessOrm;
import org.ash.inventory.operations.internal.persistence.LocationHierarchyOrm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.*;

/**
 * Maintains {@link InventoryAccessLink}: a private item inherits the shares and the owner of its private
 * home location and that location's private ancestors; a private location those of its private
 * ancestors. A tenant shares their building once and everything stored there follows. Only the home
 * location ({@code Item.storageLocation}) counts, not where single units currently are.
 */
@ApplicationScoped
public class InventoryAccessInheritance {
    @Inject InventoryAccessOrm access;
    @Inject LocationHierarchyOrm hierarchy;

    public void refreshItem(Item item) {
        if (item.accessPolicy == null) return;
        access.replaceLinks(item.accessPolicy, privateChain(item.storageLocation));
    }

    /** Call under {@code LocationHierarchyService.lockHierarchy()} after a location was created or moved. */
    public void refreshLocationSubtree(StorageLocation root) {
        var subtree = new ArrayList<StorageLocation>();
        var pending = new ArrayDeque<StorageLocation>(List.of(root));
        var visited = new HashSet<UUID>();
        while (!pending.isEmpty()) {
            var location = pending.pop();
            if (!visited.add(location.id)) continue;
            subtree.add(location);
            pending.addAll(hierarchy.children(location));
        }
        for (var location : subtree)
            if (location.accessPolicy != null) access.replaceLinks(location.accessPolicy, privateChain(location.parent));
        for (var item : hierarchy.itemsStoredIn(visited)) refreshItem(item);
    }

    /** Policies of {@code start} and its ancestors that are private, nearest first. */
    private static List<InventoryAccessPolicy> privateChain(StorageLocation start) {
        var result = new ArrayList<InventoryAccessPolicy>();
        var visited = new HashSet<UUID>();
        for (var cursor = start; cursor != null && visited.add(cursor.id); cursor = cursor.parent)
            if (cursor.accessPolicy != null) result.add(cursor.accessPolicy);
        return result;
    }
}

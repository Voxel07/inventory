package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Warehouse → area → section → shelf → compartment. Every level has a short code unique among the siblings visible to its editor;
 * the full code ({@code WH1-E1-R3-F2}) identifies a location without encoding the hierarchy into its name.
 */
@ApplicationScoped
public class LocationHierarchyService {
    public static final String CODE_SEPARATOR = "-";
    private static final Pattern CODE = Pattern.compile("[A-Z0-9_.]{1,32}");

    @Inject org.ash.inventory.orm.LocationHierarchyOrm orm;
    @Inject org.ash.inventory.helper.security.ActorService actors;
    public void lockHierarchy() {
        orm.lockWarehouses();
        orm.lockLocations();
    }
    public void apply(StorageLocation target, ApiModels.StorageLocationInput input) {
        var warehouse = input.warehouseId() == null ? null : orm.find(Warehouse.class, input.warehouseId());
        if (input.warehouseId() != null && warehouse == null) throw ApiException.badRequest("Warehouse not found");
        var parent = input.parentLocationId() == null ? null : orm.find(StorageLocation.class, input.parentLocationId());
        if (input.parentLocationId() != null && parent == null) throw ApiException.badRequest("Parent location not found");
        // Moving under a parent needs sight of it; a private parent (someone's building) also needs edit rights,
        // because its owner and grantees inherit access to what is placed inside.
        if (parent != null && (target.parent == null || !parent.id.equals(target.parent.id)))
            actors.requireLocationAccess(parent, parent.accessPolicy != null);
        var visited = new HashSet<UUID>();
        for (var cursor = parent; cursor != null; cursor = cursor.parent) {
            if (Objects.equals(cursor.id, target.id) || !visited.add(cursor.id)) throw ApiException.conflict("A location cannot be its own ancestor");
        }
        boolean active = input.active() == null ? target.active : input.active();
        if (parent != null && !Objects.equals(id(parent.warehouse), id(warehouse))) throw ApiException.conflict("Parent and child must belong to the same warehouse");
        if (active && ((warehouse != null && !warehouse.active) || (parent != null && !parent.active))) throw ApiException.conflict("Activate the warehouse and parent first");
        if (target.id != null) for (var child : orm.children(target)) {
            if (!Objects.equals(id(child.warehouse), id(warehouse))) throw ApiException.conflict("Move child locations before changing warehouse");
            if (!active && child.active) throw ApiException.conflict("Deactivate child locations first");
        }
        target.parent = parent; target.warehouse = warehouse; target.active = active;
        target.code = siblingUniqueCode(target, input.code());
        refreshCodes(target);
    }

    /**
     * An explicit code must be free among the siblings; a code derived from the name is numbered until it is.
     * Only siblings the caller can see count, so a clash never reveals another owner's private location.
     * {@link #lockHierarchy()} serializes concurrent checks.
     */
    private String siblingUniqueCode(StorageLocation target, String requested) {
        boolean explicit = requested != null && !requested.isBlank();
        String base = explicit ? requested.trim().toUpperCase(Locale.ROOT) : deriveCode(target.name);
        if (!CODE.matcher(base).matches())
            throw ApiException.badRequest("Location code may only contain A-Z, 0-9, '_' and '.' (max. 32 characters)");
        var taken = new HashSet<String>();
        for (var sibling : orm.siblings(target))
            if (sibling.code != null && actors.canViewLocation(sibling)) taken.add(sibling.code.toUpperCase(Locale.ROOT));
        if (!taken.contains(base)) return base;
        if (explicit) throw ApiException.conflict("Location code " + base + " is already used on this level");
        for (int n = 2; ; n++) {
            String candidate = base + "_" + n;
            if (!taken.contains(candidate)) return candidate;
        }
    }

    /** Recomputes the full code of {@code location} and its whole subtree. */
    public void refreshCodes(StorageLocation location) {
        String prefix = location.parent != null ? location.parent.fullCode
                : location.warehouse != null ? location.warehouse.code : null;
        location.fullCode = prefix == null ? location.code : prefix + CODE_SEPARATOR + location.code;
        if (location.id != null) for (var child : orm.children(location)) refreshCodes(child);
    }

    /** After a warehouse code change, every location in the warehouse carries the new prefix. */
    public void refreshWarehouseCodes(Warehouse warehouse) {
        for (var root : orm.roots(warehouse)) refreshCodes(root);
    }

    /** {@code "Technik-Lager 1"} → {@code TL1}, {@code "Regal 3"} → {@code R3}, {@code "Funkraum"} → {@code FUNK}. */
    public static String deriveCode(String name) {
        String ascii = Normalizer.normalize(name == null ? "" : name
                .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("Ä", "Ae").replace("Ö", "Oe").replace("Ü", "Ue").replace("ß", "ss"),
                Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        var words = Arrays.stream(ascii.split("[^A-Za-z0-9]+")).filter(word -> !word.isEmpty()).toList();
        var letters = words.stream().filter(word -> !word.chars().allMatch(Character::isDigit)).toList();
        String digits = String.join("", words.stream().filter(word -> word.chars().allMatch(Character::isDigit)).toList());
        String head = letters.size() == 1 && digits.isEmpty()
                ? letters.getFirst().substring(0, Math.min(4, letters.getFirst().length()))
                : String.join("", letters.stream().map(word -> word.substring(0, 1)).toList());
        String code = (head + digits).toUpperCase(Locale.ROOT);
        if (code.isEmpty()) code = "LOC";
        return code.length() > 32 ? code.substring(0, 32) : code;
    }

    public void deactivate(StorageLocation location) {
        if (orm.activeChildren(location) > 0) throw ApiException.conflict("Deactivate child locations first");
        location.active = false;
    }
    private UUID id(Warehouse value) { return value == null ? null : value.id; }

    public void validateWarehouseState(Warehouse warehouse, boolean active) {
        if (!active && warehouse.id != null && orm.activeLocations(warehouse) > 0) throw ApiException.conflict("Deactivate warehouse locations first");
    }
}

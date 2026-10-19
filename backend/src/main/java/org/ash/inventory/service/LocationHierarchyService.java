package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.ApiException;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Location → section → storage places (nestable). A top-level location only groups its sections and holds no stock.
 * Every level has a short code unique among the siblings visible to its editor;
 * the full code ({@code BH-CE-R2-F7}) identifies a location without encoding the hierarchy into its name.
 */
@ApplicationScoped
public class LocationHierarchyService {
    public static final String CODE_SEPARATOR = "-";
    public static final int MAX_STRUCTURE_NODES = 1000;
    public static final int MAX_DEPTH = 16;
    private static final Pattern CODE = Pattern.compile("[A-Z0-9_.]{1,32}");

    @Inject org.ash.inventory.orm.LocationHierarchyOrm orm;
    @Inject org.ash.inventory.helper.security.ActorService actors;
    public void lockHierarchy() {
        orm.lockLocations();
    }

    /** Reject oversized trees before taking the hierarchy fence or creating rows. */
    public static void validateStructure(org.ash.inventory.resource.ApiModels.StorageStructureInput input) {
        record Node(org.ash.inventory.resource.ApiModels.StorageNodeInput value, int depth) {}
        var pending = new ArrayDeque<Node>();
        if (input.sections() != null) for (var node : input.sections()) pending.add(new Node(node, 1));
        int count = 1;
        while (!pending.isEmpty()) {
            var node = pending.removeFirst();
            if (node.value() == null) throw ApiException.badRequest("A storage node is required");
            if (++count > MAX_STRUCTURE_NODES || node.depth() >= MAX_DEPTH)
                throw ApiException.badRequest("Storage structures allow at most 1000 nodes and 16 levels including the root");
            if (node.value().children() != null) for (var child : node.value().children())
                pending.addLast(new Node(child, node.depth() + 1));
        }
    }

    /** Places {@code target} under {@code parent} (null = top-level location) with the requested code and active flag. */
    public void apply(StorageLocation target, StorageLocation parent, String code, Boolean requestedActive) {
        // Moving under a parent needs sight of it; a private parent (someone's building) also needs edit rights,
        // because its owner and grantees inherit access to what is placed inside.
        if (parent != null && (target.parent == null || !parent.id.equals(target.parent.id)))
            actors.requireLocationAccess(parent, parent.accessPolicy != null);
        var visited = new HashSet<UUID>();
        for (var cursor = parent; cursor != null; cursor = cursor.parent) {
            if (Objects.equals(cursor.id, target.id) || !visited.add(cursor.id)) throw ApiException.conflict("A location cannot be its own ancestor");
            if (visited.size() > MAX_DEPTH) throw ApiException.badRequest("Storage location depth exceeds 16");
        }
        boolean active = requestedActive == null ? target.active : requestedActive;
        if (visited.size() + 1 + (target.id == null ? 0 : orm.subtreeHeight(target.id)) > MAX_DEPTH)
            throw ApiException.badRequest("Moving this subtree would exceed depth 16");
        if (active && parent != null && !parent.active) throw ApiException.conflict("Activate the parent location first");
        if (target.id != null) {
            if (parent == null && target.parent != null && orm.holdsStock(target))
                throw ApiException.conflict("Move the stock out first: top-level locations hold no stock");
            if (!active) for (var child : orm.children(target))
                if (child.active) throw ApiException.conflict("Deactivate child locations first");
        }
        target.parent = parent; target.active = active;
        // Storage places show the map of their section or location.
        if (target.depth() >= 2) {
            target.latitude = null; target.longitude = null; target.mapOverlayUrl = null; target.overlayBounds = null;
        }
        target.code = siblingUniqueCode(target, code);
        refreshCodes(target);
    }

    /** Stock, assets and home locations live in sections and storage places, never directly in a top-level location. */
    public static void requireStockLocation(StorageLocation location) {
        if (location != null && !location.holdsStock())
            throw ApiException.badRequest("Location " + location.name + " holds no stock; choose a section or storage place");
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
        // Without an explicit code an existing location keeps its code, even when it is renamed.
        if (!explicit && target.id != null && target.code != null && !taken.contains(target.code.toUpperCase(Locale.ROOT))) return target.code;
        if (!taken.contains(base)) return base;
        if (explicit) throw ApiException.conflict("Location code " + base + " is already used on this level");
        for (int n = 2; ; n++) {
            String candidate = base + "_" + n;
            if (!taken.contains(candidate)) return candidate;
        }
    }

    /** Recomputes the full code of {@code location} and its whole subtree. */
    public void refreshCodes(StorageLocation location) {
        location.fullCode = location.parent == null ? location.code : location.parent.fullCode + CODE_SEPARATOR + location.code;
        if (location.id != null) for (var child : orm.children(location)) refreshCodes(child);
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

    /** {@code root} and every location below it. */
    public Set<UUID> subtreeIds(UUID root) { return orm.subtreeIds(root); }

    public void deactivate(StorageLocation location) {
        if (orm.activeChildren(location) > 0) throw ApiException.conflict("Deactivate child locations first");
        location.active = false;
    }
}

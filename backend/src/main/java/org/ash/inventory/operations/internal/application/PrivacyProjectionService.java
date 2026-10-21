package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.persistence.InventoryAccessOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.InventoryAccess;
import org.ash.inventory.platform.api.ApiException;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Defense for nested DTO/history projections in addition to scoped primary queries.
 *
 * <p>Only typed references take part: a JSON value that is entirely a UUID, a UUID map key, or a UUID array
 * element. A UUID embedded in free text (notes, descriptions, reasons, names) is never a reference, and the
 * free-text fields below are skipped even when their whole value happens to be a UUID.
 */
@ApplicationScoped
public class PrivacyProjectionService {
    private static final Pattern UUID_VALUE = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Set<String> FREE_TEXT = Set.of("notes", "note", "description", "reason", "purpose", "name", "hint",
            "message", "comment", "comments", "label", "title", "details", "resolutionNote", "conflictMessage", "error",
            "verificationResult", "positionDetails", "acknowledgementNotes", "body", "text");
    @Inject ObjectMapper json;
    @Inject InventoryAccessOrm orm;
    @Inject ActorService actors;
    @Inject InventoryAccess access;

    /** Whether one resource is (transitively) hidden from the actor; walks only that resource's ancestors. */
    @Transactional
    public boolean denied(UUID resourceId) {
        return orm.referenceAccess(Set.of(resourceId), actors.current()).deniedIds().contains(resourceId);
    }
    /** The subset of the given resources (transitively) hidden from the actor. */
    @Transactional
    public Set<UUID> deniedAmong(Set<UUID> resourceIds) {
        if (resourceIds.isEmpty()) return Set.of();
        return orm.referenceAccess(resourceIds, actors.current()).deniedIds();
    }

    /** Flat evidence rows (reports, inbox actions): hidden when any typed reference is denied. */
    public boolean visible(Object value, Set<String> denied) { return visibleTree(json.valueToTree(value), denied); }
    public boolean visibleTree(JsonNode node, Set<String> denied) {
        if (denied.isEmpty() || node == null) return true;
        var references = new HashSet<UUID>();
        collectReferences(node, null, references);
        return references.stream().noneMatch(reference -> denied.contains(reference.toString()));
    }

    /**
     * {@code removedRows}: array rows dropped because the row itself is hidden. {@code queriedRows}: rows the page
     * query returned before that, which decides whether a further page may exist.
     */
    public record Projection(JsonNode value, boolean containsPrivateReference, int removedRows, int queriedRows) {}

    /**
     * {@code read}: a GET of the resource. A hidden root is then "not found"; a command response, whose write the
     * command boundary already authorized and committed, is reduced to its id instead.
     */
    @Transactional
    public Projection filter(Object value, boolean read) {
        JsonNode tree;
        try { tree = value instanceof String s ? json.readTree(s) : json.valueToTree(value); }
        catch (Exception e) { throw new IllegalStateException("Cannot authorize response projection", e); }
        var references = references(tree);
        var facts = orm.referenceAccess(references, actors.current());
        var denied = facts.deniedIds();
        int removed = 0, queried = tree.isArray() ? tree.size() : 1;
        if (tree.isArray()) {
            var result = json.createArrayNode();
            for (var row : tree) {
                if (deniedIdentity(row, denied)) { removed++; continue; }
                result.add(redact(row, denied));
            }
            tree = result;
        } else if (deniedIdentity(tree, denied)) {
            if (read) throw ApiException.notFound("Resource not found");
            tree = json.createObjectNode().put("id", tree.get("id").textValue()).put("redacted", true);
        } else {
            tree = redact(tree, denied);
        }
        boolean containsPrivate = references(tree).stream().anyMatch(facts.privateIds()::contains);
        return new Projection(tree, containsPrivate, removed, queried);
    }

    public void requireEditableReferences(Object value) {
        JsonNode tree = json.valueToTree(value); var actor = actors.current();
        // Lock policies in a deterministic order while the command transaction is active.
        orm.referencedPolicies(references(tree)).stream().sorted(Comparator.comparing(policy -> policy.id))
                .forEach(policy -> access.require(policy, actor, true, actors.inUsageCommand()));
    }

    private static UUID reference(JsonNode node) {
        if (node == null || !node.isTextual() || !UUID_VALUE.matcher(node.textValue()).matches()) return null;
        return UUID.fromString(node.textValue());
    }

    private static boolean deniedIdentity(JsonNode node, Set<UUID> denied) {
        var id = node != null && node.isObject() ? reference(node.get("id")) : null;
        return id != null && denied.contains(id);
    }

    /**
     * Removes hidden nested references: a denied id field is nulled together with the fields describing it
     * ({@code currentLocationId} also clears {@code currentLocationName}); denied array elements, map entries and
     * nested objects are dropped. The containing object itself stays visible.
     */
    private JsonNode redact(JsonNode node, Set<UUID> denied) {
        if (denied.isEmpty() || node == null) return node;
        if (node.isArray()) {
            var result = json.createArrayNode();
            for (var child : node) {
                var id = reference(child);
                if ((id != null && denied.contains(id)) || deniedIdentity(child, denied)) continue;
                result.add(redact(child, denied));
            }
            return result;
        }
        if (!node.isObject()) return node;
        var result = json.createObjectNode();
        var cleared = new HashSet<String>();
        for (var field : node.properties()) {
            String name = field.getKey();
            var key = UUID_VALUE.matcher(name).matches() ? UUID.fromString(name) : null;
            if (key != null && denied.contains(key)) continue;
            var value = field.getValue();
            var id = FREE_TEXT.contains(name) ? null : reference(value);
            if (id != null && denied.contains(id)) { cleared.add(stem(name)); result.putNull(name); continue; }
            if (deniedIdentity(value, denied)) { result.putNull(name); continue; }
            result.set(name, FREE_TEXT.contains(name) ? value : redact(value, denied));
        }
        if (!cleared.isEmpty()) clearDescriptions(result, cleared);
        return result;
    }

    private static String stem(String field) {
        return field.endsWith("Id") && field.length() > 2 ? field.substring(0, field.length() - 2) : field;
    }

    /** Fields that describe a referenced resource next to its id field. */
    private static final List<String> DESCRIPTIONS = List.of("", "Name", "Code", "Sku", "Label", "Number");

    private static void clearDescriptions(ObjectNode node, Set<String> stems) {
        for (var stem : stems) for (var suffix : DESCRIPTIONS) if (node.has(stem + suffix)) node.putNull(stem + suffix);
    }

    private Set<UUID> references(JsonNode tree) {
        var result = new HashSet<UUID>();
        collectReferences(tree, null, result);
        return result;
    }

    private static void collectReferences(JsonNode node, String field, Set<UUID> result) {
        if (node == null || (field != null && FREE_TEXT.contains(field))) return;
        if (node.isTextual()) {
            var id = reference(node);
            if (id != null) result.add(id);
        } else if (node.isObject()) {
            for (var entry : node.properties()) {
                if (UUID_VALUE.matcher(entry.getKey()).matches()) result.add(UUID.fromString(entry.getKey()));
                collectReferences(entry.getValue(), entry.getKey(), result);
            }
        } else if (node.isArray()) {
            for (var child : node) collectReferences(child, field, result);
        }
    }
}

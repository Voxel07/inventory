package org.ash.inventory.service;

import com.fasterxml.jackson.databind.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.*;
import org.ash.inventory.orm.InventoryAccessOrm;
import org.ash.inventory.resource.ApiException;
import java.util.*;
import java.util.regex.Pattern;

/** Defense for immutable nested DTO/history projections in addition to scoped primary queries. */
@ApplicationScoped
public class PrivacyProjectionService {
    private static final Pattern UUID_TEXT = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    @Inject ObjectMapper json;
    @Inject InventoryAccessOrm orm;
    @Inject ActorService actors;
    @Inject InventoryAccess access;

    @Transactional
    public Set<String> deniedIds() {
        return orm.deniedReferences(actors.current()).stream().map(UUID::toString).collect(java.util.stream.Collectors.toSet());
    }
    /** Whether one resource is (transitively) hidden from the actor; walks only that resource's ancestors. */
    @Transactional
    public boolean denied(UUID resourceId) {
        return orm.referenceAccess(Set.of(resourceId), actors.current()).deniedIds().contains(resourceId);
    }
    public boolean visible(Object value, Set<String> denied) { return visibleTree(json.valueToTree(value), denied); }
    public boolean visibleTree(JsonNode node, Set<String> denied) {
        if (denied.isEmpty() || node == null) return true;
        if (node.isTextual()) {
            var matcher = UUID_TEXT.matcher(node.textValue());
            while (matcher.find()) if (denied.contains(matcher.group().toLowerCase(Locale.ROOT))) return false;
        } else if (node.isObject()) {
            var fields = node.properties();
            for (var field : fields) if (denied.contains(field.getKey().toLowerCase(Locale.ROOT)) || !visibleTree(field.getValue(), denied)) return false;
        } else if (node.isArray()) for (var child : node) if (!visibleTree(child, denied)) return false;
        return true;
    }
    /** {@code removedRows}: array rows dropped after pagination, so clients can tell a filtered page from the last page. */
    public record Projection(JsonNode value, boolean containsPrivateReference, int removedRows) {}

    @Transactional
    public Projection filter(Object value) {
        JsonNode tree;
        try { tree = value instanceof String s ? json.readTree(s) : json.valueToTree(value); }
        catch (Exception e) { throw new IllegalStateException("Cannot authorize response projection", e); }
        var facts = orm.referenceAccess(references(tree), actors.current());
        var denied = strings(facts.deniedIds());
        int removed = 0;
        if (tree.isArray()) {
            var result = json.createArrayNode();
            for (var row : tree) if (visibleTree(row, denied)) result.add(row);
            removed = tree.size() - result.size();
            tree = result;
        } else {
            if (!visibleTree(tree, denied)) throw ApiException.notFound("Resource not found");
        }
        return new Projection(tree, !visibleTree(tree, strings(facts.privateIds())), removed);
    }
    public void requireEditableReferences(Object value) {
        JsonNode tree = json.valueToTree(value); var actor = actors.current();
        // Lock policies in a deterministic order while the command transaction is active.
        orm.referencedPolicies(references(tree)).stream().sorted(Comparator.comparing(policy -> policy.id))
                .forEach(policy -> access.require(policy, actor, true));
    }

    private Set<String> strings(Set<UUID> ids) {
        return ids.stream().map(UUID::toString).collect(java.util.stream.Collectors.toSet());
    }

    private Set<UUID> references(JsonNode tree) {
        var result = new HashSet<UUID>();
        collectReferences(tree, result);
        return result;
    }

    private void collectReferences(JsonNode node, Set<UUID> result) {
        if (node == null) return;
        if (node.isTextual()) {
            var matcher = UUID_TEXT.matcher(node.textValue());
            while (matcher.find()) result.add(UUID.fromString(matcher.group()));
        } else if (node.isObject()) {
            for (var field : node.properties()) {
                if (UUID_TEXT.matcher(field.getKey()).matches()) result.add(UUID.fromString(field.getKey()));
                collectReferences(field.getValue(), result);
            }
        } else if (node.isArray()) {
            for (var child : node) collectReferences(child, result);
        }
    }
}

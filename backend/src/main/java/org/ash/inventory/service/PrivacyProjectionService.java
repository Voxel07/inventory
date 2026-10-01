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
    private Set<String> expand(Set<String> ids) {
        var roots = ids.stream().map(UUID::fromString).collect(java.util.stream.Collectors.toSet());
        orm.relatedReferences(roots).forEach(id -> ids.add(id.toString()));
        return ids;
    }
    @Transactional
    public boolean containsPrivateReference(Object value) {
        var ids = new HashSet<String>();
        orm.privateItems().forEach(i -> ids.add(i.id.toString()));
        orm.privateLocations().forEach(l -> ids.add(l.id.toString()));
        return !visible(value, expand(ids));
    }
    public boolean visible(Object value, Set<String> denied) { return visibleTree(json.valueToTree(value), denied); }
    public boolean visibleTree(JsonNode node, Set<String> denied) {
        if (denied.isEmpty() || node == null) return true;
        if (node.isTextual()) {
            var matcher = UUID_TEXT.matcher(node.textValue());
            while (matcher.find()) if (denied.contains(matcher.group().toLowerCase(Locale.ROOT))) return false;
        } else if (node.isObject()) {
            var fields = node.properties();
            for (var field : fields) if (denied.contains(field.getKey()) || !visibleTree(field.getValue(), denied)) return false;
        } else if (node.isArray()) for (var child : node) if (!visibleTree(child, denied)) return false;
        return true;
    }
    @Transactional
    public JsonNode filter(Object value) {
        JsonNode tree;
        try { tree = value instanceof String s ? json.readTree(s) : json.valueToTree(value); }
        catch (Exception e) { throw new IllegalStateException("Cannot authorize response projection", e); }
        var denied = deniedIds();
        if (tree.isArray()) {
            var result = json.createArrayNode();
            for (var row : tree) if (visibleTree(row, denied)) result.add(row);
            return result;
        }
        if (!visibleTree(tree, denied)) throw ApiException.notFound("Resource not found");
        return tree;
    }
    public void requireEditableReferences(Object value) {
        JsonNode tree = json.valueToTree(value); var actor = actors.current();
        // Lock policies in a deterministic order while the command transaction is active.
        var policies = new HashMap<UUID, org.ash.inventory.model.InventoryAccessPolicy>();
        orm.privateItems().forEach(i -> policies.put(i.id, i.accessPolicy));
        orm.privateLocations().forEach(l -> policies.put(l.id, l.accessPolicy));
        var resources = new TreeMap<UUID, org.ash.inventory.model.InventoryAccessPolicy>();
        orm.referenceOrigins(policies.keySet()).forEach((root, references) -> {
            if (references.stream().anyMatch(id -> contains(tree, id.toString()))) {
                var policy = policies.get(root); resources.put(policy.id, policy);
            }
        });
        resources.values().forEach(policy -> access.require(policy, actor, true));
    }
    private boolean contains(JsonNode tree, String id) { return !visibleTree(tree, Set.of(id)); }
}

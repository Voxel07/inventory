package org.ash.inventory.operations.internal.application;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.validation.Validator;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.model.CsvImportJob;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.EpochTime;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiFunction;

@ApplicationScoped
public class CsvImportSupport {
    @Inject ObjectMapper mapper;
    @Inject Validator validator;
    @Inject CatalogService catalog;

    public ObjectNode object() { return mapper.createObjectNode(); }
    public ObjectNode json(Object value) { return mapper.valueToTree(value); }
    public ObjectNode copy(JsonNode value) {
        if (!value.isObject()) throw ApiException.badRequest("Import data must be an object");
        return ((ObjectNode)value).deepCopy();
    }

    public <T> T input(JsonNode data, Class<T> type) {
        T value;
        try { value = mapper.readerFor(type).without(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(data); }
        catch (java.io.IOException | IllegalArgumentException invalid) { throw ApiException.badRequest("Invalid " + type.getSimpleName() + " fields"); }
        var violations = validator.validate(value);
        if (!violations.isEmpty()) throw ApiException.badRequest(violations.stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage()).sorted().findFirst().orElse("Invalid import data"));
        return value;
    }

    public static UUID id(JsonNode node) {
        if (node.isMissingNode() || node.isNull() || node.asText().isBlank()) return null;
        try { return UUID.fromString(node.asText()); }
        catch (IllegalArgumentException invalid) { throw ApiException.badRequest("Invalid reference: " + node.asText()); }
    }
    public UUID itemId(CsvImportJob job, JsonNode ref) {
        String key = ref.asText();
        var alias = job.context.path("items").path(key);
        UUID id = id(alias.isMissingNode() ? ref : alias);
        if (id == null) throw ApiException.badRequest("Item reference is missing");
        catalog.getVisibleItem(id);
        return id;
    }
    public void remember(CsvImportJob job, String section, String key, UUID value) {
        ObjectNode entries = job.context.withObject("/" + section);
        entries.put(key, value.toString());
    }
    public void increment(CsvImportJob job, String field) { job.result.put(field, job.result.path(field).asInt() + 1); }
    public ObjectNode quantities(CsvImportJob job, JsonNode components) {
        var result = object();
        for (var component : components) {
            String key = itemId(job, component.path("itemId")).toString();
            int quantity = component.path("quantity").asInt();
            if (quantity <= 0) throw ApiException.badRequest("Component quantity must be positive");
            result.put(key, Math.addExact(result.path(key).asInt(), quantity));
        }
        return result;
    }

    public static <T> List<T> all(BiFunction<Integer, Integer, List<T>> load) {
        var result = new ArrayList<T>();
        for (int page = 0; ; page++) {
            var rows = load.apply(page, 200);
            result.addAll(rows);
            if (rows.size() < 200) return result;
        }
    }
    public List<Item> items() {
        return all((page, size) -> catalog.getItems((String)null, null, page * size, size));
    }
    public List<StorageLocation> locations() {
        return all((page, size) -> catalog.getLocations(false, null, null, page * size, size));
    }
    public static String normalizeLocation(String value) {
        return String.join(" / ", java.util.Arrays.stream(value.split("\\s*[/>\\\\]\\s*")).map(String::trim)
                .filter(part -> !part.isEmpty()).toList()).toLowerCase(Locale.ROOT);
    }
    public Map<String, StorageLocation> locationIndex() {
        var index = new LinkedHashMap<String, StorageLocation>();
        var names = new LinkedHashMap<String, StorageLocation>();
        for (var location : locations()) {
            index.put(location.id.toString(), location);
            index.put(location.fullCode.toLowerCase(Locale.ROOT), location);
            var path = new ArrayList<String>();
            for (var node = location; node != null; node = node.parent) path.addFirst(node.name);
            index.put(normalizeLocation(String.join(" / ", path)), location);
            String name = location.name.trim().toLowerCase(Locale.ROOT);
            if (names.containsKey(name)) names.put(name, null); else names.put(name, location);
        }
        names.forEach((name, location) -> { if (!index.containsKey(name)) index.put(name, location); });
        return index;
    }

    public UUID locationPath(JsonNode segments, boolean create) {
        var index = locationIndex();
        StorageLocation parent = null;
        var path = new ArrayList<String>();
        for (var segment : segments) {
            path.add(segment.asText());
            String key = normalizeLocation(String.join(" / ", path));
            var known = index.get(key);
            if (known != null) { parent = known; continue; }
            if (!create) throw ApiException.badRequest("Storage location not found: " + key);
            var data = object().put("name", segment.asText());
            if (parent != null) data.put("parentLocationId", parent.id.toString());
            parent = catalog.createLocation(input(data, ApiModels.StorageLocationInput.class));
            index.put(key, parent);
        }
        return parent == null ? null : parent.id;
    }

    /** Same stable command namespace as CSV stock/history imports; a restarted job never replays a committed row. */
    public static UUID command(String name) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(("inventory-csv:" + name).getBytes(StandardCharsets.UTF_8));
            bytes[6] = (byte)((bytes[6] & 15) | 80); bytes[8] = (byte)((bytes[8] & 63) | 128);
            var buffer = ByteBuffer.wrap(bytes);
            return new UUID(buffer.getLong(), buffer.getLong());
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    public JsonNode resolve(CsvImportJob job, JsonNode node, String field) {
        if (node.isObject()) {
            var result = object();
            node.properties().forEach(entry -> result.set(entry.getKey(), resolve(job, entry.getValue(), entry.getKey())));
            return result;
        }
        if (node.isArray()) {
            var result = mapper.createArrayNode();
            node.forEach(entry -> result.add(resolve(job, entry, null)));
            return result;
        }
        if (!node.isTextual()) return node;
        String value = node.asText();
        if (value.isBlank() && field != null && field.matches(".*(?:Date|occurredAt|nextDueAt|receivedAt|availableFrom|availableUntil|returnDue)$"))
            return mapper.getNodeFactory().nullNode();
        if (field != null && field.matches(".*(?:Date|availableFrom|availableUntil|returnDue)$") && value.matches("\\d{2}\\.\\d{2}\\.\\d{4}"))
            return mapper.getNodeFactory().numberNode(EpochTime.millis(date(value)));
        if (!value.startsWith("@")) return node;
        String resolved = null;
        if (value.startsWith("@item:")) {
            String needle = value.substring(6).trim().toLowerCase(Locale.ROOT);
            var values = items();
            var matches = values.stream().filter(item -> item.id.toString().equals(needle)
                    || item.sku != null && item.sku.trim().toLowerCase(Locale.ROOT).equals(needle)).toList();
            if (matches.isEmpty()) matches = values.stream().filter(item -> item.name.trim().toLowerCase(Locale.ROOT).equals(needle)).toList();
            if (matches.size() == 1) resolved = matches.getFirst().id.toString();
        } else if (value.startsWith("@location:")) {
            var location = locationIndex().get(normalizeLocation(value.substring(10)));
            if (location != null) resolved = location.id.toString();
        } else if (value.startsWith("@event:")) {
            String[] parts = value.substring(7).split(":", 2);
            if (parts.length == 2) resolved = catalog.getEvents(parts[0]).stream().filter(event -> event.startDate.equals(date(parts[1])))
                    .map(event -> event.id.toString()).findFirst().orElse(null);
        } else if (value.startsWith("@row:")) resolved = job.context.path("outputs").path(value.substring(5)).asText(null);
        else if (value.matches("@(date|datetime):[+-]?\\d+")) {
            var zone = ZoneId.of(job.timezone);
            var day = job.createdAt.atZone(zone).toLocalDate().plusDays(Long.parseLong(value.substring(value.indexOf(':') + 1)));
            return mapper.getNodeFactory().numberNode(value.startsWith("@datetime:") ? day.atTime(12, 0).atZone(zone).toInstant().toEpochMilli() : EpochTime.millis(day));
        } else return node;
        if (resolved == null) throw ApiException.badRequest("Reference could not be resolved: " + value);
        return mapper.getNodeFactory().textNode(resolved);
    }

    private LocalDate date(String value) {
        try { return LocalDate.parse(value, DateTimeFormatter.ofPattern("dd.MM.uuuu").withResolverStyle(ResolverStyle.STRICT)); }
        catch (java.time.DateTimeException invalid) { throw ApiException.badRequest("Invalid CSV date: " + value); }
    }
}

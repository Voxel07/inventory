package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import java.util.List;
import java.time.Instant;

/** Persistence queries for the OperationalReport use cases. Business rules remain in the service. */
@ApplicationScoped
public class OperationalReportOrm extends EntityOrm {
    public boolean tryRebuildLock(String name) {
        return Boolean.TRUE.equals(entityManager.createNativeQuery("select pg_try_advisory_xact_lock(659743252, hashtext(:name))").setParameter("name",name).getSingleResult());
    }
    @jakarta.inject.Inject com.fasterxml.jackson.databind.ObjectMapper json;
    public record Page(int total, List<java.util.Map<String, Object>> rows, List<java.util.Map<String, Object>> monthlyTotals) {}

    /** PostgreSQL filters snapshot JSON; only the requested page enters application memory. */
    public Page rows(String name, java.util.Map<String, String> filters, UserAccount actor, long offset, int limit) {
        var where = new StringBuilder(" where r.name = :name");
        var parameters = new java.util.LinkedHashMap<String, Object>();
        parameters.put("name", name); parameters.put("actor", actor.id);
        parameters.put("admin", actor.role == DomainEnums.UserRole.admin);
        parameters.put("public", actor.role.atLeast(DomainEnums.UserRole.read_only));
        for (var entry : java.util.Map.of("itemId", "item", "locationId", "location", "siteId", "location", "orderId", "order", "assemblyId", "assembly").entrySet())
            where.append(" and inventory_resource_visible('").append(entry.getValue()).append("', cast(value->>'")
                    .append(entry.getKey()).append("' as uuid), :actor, :admin, :public)");
        var allowed = java.util.Set.of("itemId", "eventId", "locationId", "siteId", "category", "status", "from", "to", "search");
        for (var entry : filters.entrySet()) {
            if (!allowed.contains(entry.getKey())) throw org.ash.inventory.resource.ApiException.badRequest("Unknown report filter");
            if (entry.getValue() == null || entry.getValue().isBlank()) continue;
            String key = entry.getKey(), parameter = "f_" + key;
            if (key.equals("search")) {
                where.append(" and exists(select 1 from jsonb_each_text(value) f where lower(f.value) like :").append(parameter).append(" escape '!')");
                parameters.put(parameter, "%" + entry.getValue().toLowerCase(java.util.Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
            } else {
                where.append(" and value->>'").append(key.equals("from") || key.equals("to") ? "date" : key).append("' ")
                        .append(key.equals("from") ? ">=" : key.equals("to") ? "<=" : "=").append(" :").append(parameter);
                parameters.put(parameter, entry.getValue());
            }
        }
        String source = " from operational_reports r cross join lateral jsonb_array_elements(r.report_rows) with ordinality snapshot(value, ordinal)" + where;
        var count = entityManager.createNativeQuery("select count(*)" + source);
        parameters.forEach(count::setParameter);
        int total = Math.toIntExact(((Number) count.getSingleResult()).longValue());
        if (limit == Integer.MAX_VALUE && total > 25000)
            throw new org.ash.inventory.resource.ApiException(413, "Report export exceeds 25,000 rows; narrow the filters");
        var query = entityManager.createNativeQuery("select cast(value as text)" + source + " order by ordinal offset :offset limit :limit");
        parameters.forEach(query::setParameter); query.setParameter("offset", offset).setParameter("limit", limit);
        var rows = new java.util.ArrayList<java.util.Map<String, Object>>();
        for (var encoded : query.getResultList()) rows.add(decode(encoded.toString()));
        List<java.util.Map<String, Object>> totals = List.of();
        if (filters.containsKey("itemId") && java.util.Set.of("purchases", "movements").contains(name)) {
            String sums = name.equals("purchases")
                    ? "sum(cast(value->>'ordered' as bigint)) as ordered, sum(cast(value->>'received' as bigint)) as received, sum(cast(value->>'openDelivery' as bigint)) as \"openDelivery\", sum(cast(value->>'valueCents' as bigint)) as \"valueCents\""
                    : "sum(cast(value->>'quantity' as bigint)) as quantity";
            var aggregate = entityManager.createNativeQuery("select cast(row_to_json(t) as text) from (select value->>'month' as month, value->>'status' as status, "
                    + sums + source + " group by value->>'month', value->>'status' order by month, status) t");
            parameters.forEach(aggregate::setParameter);
            var values = new java.util.ArrayList<java.util.Map<String, Object>>();
            for (var encoded : aggregate.getResultList()) values.add(decode(encoded.toString()));
            totals = values;
        }
        return new Page(total, rows, totals);
    }
    private java.util.Map<String, Object> decode(String value) {
        try { return json.readValue(value, new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {}); }
        catch (com.fasterxml.jackson.core.JsonProcessingException exception) { throw new IllegalStateException("Invalid report snapshot", exception); }
    }
    public record Header(long version, Instant startedAt, Instant generatedAt, String sourceToken) {}
    public Header header(String name) {
        var rows = entityManager.createQuery("select r.version, r.startedAt, r.generatedAt, r.sourceToken from OperationalReport r where r.name = :name", Object[].class)
                .setParameter("name", name).getResultList();
        if (rows.isEmpty()) return null;
        var row = rows.getFirst();
        return new Header(((Number) row[0]).longValue(), (Instant) row[1], (Instant) row[2], (String) row[3]);
    }

    public <T> List<T> all(Class<T> type) {
        String fetch = switch (type.getSimpleName()) {
            case "Item" -> " left join fetch e.storageLocation sl left join fetch e.returnLocation rl";
            case "AssetInstance" -> " join fetch e.item left join fetch e.currentLocation l";
            case "RepairCase" -> " join fetch e.damageReport d left join fetch d.item left join fetch e.assetInstance a left join fetch a.currentLocation l left join fetch e.repairOwner left join fetch e.repairVendor";
            case "DamageReport" -> " left join fetch e.item left join fetch e.assembly left join fetch e.assetInstance";
            case "MaintenanceSchedule" -> " join fetch e.item left join fetch e.assetInstance a left join fetch a.currentLocation l left join fetch e.responsiblePerson";
            case "PurchaseOrderLine" -> " join fetch e.item join fetch e.purchaseOrder p join fetch p.vendor";
            case "InventoryCountLine" -> " join fetch e.item join fetch e.session left join fetch e.location l left join fetch e.assetInstance";
            default -> "";
        };
        return entityManager.createQuery("select e from " + type.getSimpleName() + " e" + fetch + " order by e.id", type).getResultList();
    }

    public List<StockTransaction> outcomeMovements() {
        return entityManager.createQuery("from StockTransaction t join fetch t.item join fetch t.user left join fetch t.eventOccurrence left join fetch t.order left join fetch t.assetInstance where t.type in :types order by t.occurredAt, t.id", StockTransaction.class)
                .setParameter("types", List.of(DomainEnums.TransactionType.consumed, DomainEnums.TransactionType.written_off)).getResultList();
    }
}

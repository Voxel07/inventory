package org.ash.inventory.operations.internal.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.model.CsvImportJob;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.persistence.OrderOrm;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.EpochTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class CsvImportOrders {
    @Inject CsvImportSupport csv;
    @Inject CatalogService catalog;
    @Inject ApiQueryService queries;
    @Inject OrderService orders;
    @Inject InventoryOperationsService inventory;

    public void faction(CsvImportJob job, JsonNode row) {
        var data = csv.copy(row.path("data"));
        var quantities = csv.quantities(job, row.path("requestedItems"));
        data.set("requestedQuantities", quantities);
        data.put("idempotencyKey", key(job, row, "create").toString());
        var existing = CsvImportSupport.all((page, size) -> queries.orders(null, null, null, List.of(), null, page, size)).stream()
                .filter(order -> order.eventType().equals(data.path("eventType").asText())
                        && order.faction().equalsIgnoreCase(data.path("faction").asText())
                        && EpochTime.millis(order.eventDate()) == data.path("eventDate").asLong()
                        && Objects.toString(order.notes(), "").trim().equals(data.path("notes").asText("").trim()))
                .findFirst();
        InventoryOrder order;
        if (existing.isPresent()) {
            order = catalog.find(InventoryOrder.class, existing.get().id());
            orders.assertCanView(order);
            if (order.status == DomainEnums.OrderStatus.preparing) order = transition(job, row, order, "submitted");
            if (Set.of(DomainEnums.OrderStatus.draft, DomainEnums.OrderStatus.submitted).contains(order.status))
                order = orders.update(order.id, csv.input(data, ApiModels.OrderInput.class));
        } else order = orders.create(csv.input(data, ApiModels.OrderInput.class));
        String target = row.path("targetStatus").asText();
        if (!target.equals("draft") && order.status == DomainEnums.OrderStatus.draft) order = transition(job, row, order, "submitted");
        if (Set.of("ready", "picked_up", "returned", "closed", "partially_returned").contains(target)) {
            if (order.status == DomainEnums.OrderStatus.submitted) order = prepare(job, row, order, quantities);
            if (order.status == DomainEnums.OrderStatus.preparing) order = transition(job, row, order, "ready");
            if (Set.of("picked_up", "returned", "closed", "partially_returned").contains(target) && order.status == DomainEnums.OrderStatus.ready)
                order = transition(job, row, order, "picked_up");
            if (Set.of("returned", "closed").contains(target)
                    && Set.of(DomainEnums.OrderStatus.picked_up, DomainEnums.OrderStatus.partially_returned).contains(order.status))
                order = orders.returnAll(order.id, key(job, row, "return-all"));
            else if (target.equals("partially_returned")
                    && Set.of(DomainEnums.OrderStatus.picked_up, DomainEnums.OrderStatus.partially_returned).contains(order.status))
                order = returnQuantities(job, row, order.id, csv.quantities(job, row.path("returnedItems")), true);
            if (target.equals("closed") && order.status == DomainEnums.OrderStatus.returned) order = transition(job, row, order, "closed");
        }
        requireTarget(order, target);
        csv.increment(job, "successOrders");
    }

    public void general(CsvImportJob job, JsonNode row) {
        String type = row.path("eventType").asText();
        long date = row.path("eventDate").asLong();
        var event = catalog.getEvents(type).stream().filter(candidate -> EpochTime.millis(candidate.startDate) == date).findFirst().orElse(null);
        if (event == null) event = catalog.createEvent(csv.input(csv.object().put("eventType", type).put("startDate", date)
                .put("endDate", date).put("status", "planned"), ApiModels.EventInput.class));
        UUID eventId = event.id;
        var data = csv.copy(row.path("data"));
        var quantities = csv.quantities(job, row.path("requestedItems"));
        data.put("eventOccurrenceId", eventId.toString());
        data.set("requestedQuantities", quantities);
        data.put("idempotencyKey", key(job, row, "create-general").toString());
        var existing = generalOrders().stream().filter(order -> order.name().equalsIgnoreCase(data.path("name").asText())
                && eventId.toString().equals(order.eventOccurrenceId())).findFirst();
        var order = existing.isPresent() ? catalog.find(InventoryOrder.class, existing.get().id())
                : orders.createGeneral(csv.input(data, ApiModels.GeneralOrderInput.class));
        orders.assertCanView(order);
        String target = row.path("targetStatus").asText();
        // Resume existing orders too; a prior import may have stopped before its requested lifecycle finished.
        if (!target.equals("draft") && order.status == DomainEnums.OrderStatus.draft) order = transition(job, row, order, "submitted");
        if (Set.of("ready", "picked_up", "partially_returned", "returned", "closed").contains(target)) {
            if (order.status == DomainEnums.OrderStatus.submitted) order = prepare(job, row, order, quantities);
            if (order.status == DomainEnums.OrderStatus.preparing) order = transition(job, row, order, "ready");
        }
        if (Set.of("picked_up", "partially_returned", "returned", "closed").contains(target) && order.status == DomainEnums.OrderStatus.ready)
            order = transition(job, row, order, "picked_up");
        if (Set.of("partially_returned", "returned", "closed").contains(target) && row.path("returnedItems").size() > 0
                && Set.of(DomainEnums.OrderStatus.picked_up, DomainEnums.OrderStatus.partially_returned).contains(order.status))
            order = returnQuantities(job, row, order.id, csv.quantities(job, row.path("returnedItems")), true);
        if (target.equals("closed") && order.status == DomainEnums.OrderStatus.returned) order = transition(job, row, order, "closed");
        requireTarget(order, target);
        csv.increment(job, "successGeneralOrders");
    }

    private List<ApiResponses.GeneralOrderSummaryResponse> generalOrders() {
        return CsvImportSupport.all((page, size) -> queries.generalOrders(new OrderOrm.Filter(List.of(), null, null, null), page, size));
    }

    private void requireTarget(InventoryOrder order, String target) {
        // The domain completes consumable-only orders at pickup.
        if (target.equals("picked_up") && order.status == DomainEnums.OrderStatus.returned) return;
        if (!order.status.name().equals(target)) throw ApiException.badRequest("Order status is " + order.status + ", expected " + target);
    }

    private InventoryOrder prepare(CsvImportJob job, JsonNode row, InventoryOrder order, ObjectNode quantities) {
        var data = csv.object();
        data.set("preparedQuantities", quantities);
        var assignments = data.putObject("assetAssignments");
        for (var entry : quantities.properties()) {
            UUID itemId = UUID.fromString(entry.getKey());
            if (catalog.getVisibleItem(itemId).trackingMode != DomainEnums.TrackingMode.serialized) continue;
            var available = assets(itemId).stream().filter(asset -> asset.availabilityStatus().equals("available")).toList();
            if (available.size() < entry.getValue().asInt()) throw ApiException.badRequest("Not enough available assets");
            var selected = assignments.putArray(entry.getKey());
            available.stream().limit(entry.getValue().asInt()).forEach(asset -> selected.add(asset.id().toString()));
        }
        data.put("idempotencyKey", key(job, row, "prepare").toString());
        return orders.prepare(order.id, csv.input(data, ApiModels.PreparationInput.class));
    }

    private InventoryOrder transition(CsvImportJob job, JsonNode row, InventoryOrder order, String status) {
        var data = csv.object().put("idempotencyKey", key(job, row, "transition:" + status).toString());
        if (status.equals("ready") && row.path("pickupPoint").isObject()) {
            data.set("pickupLatitude", row.path("pickupPoint").path("latitude"));
            data.set("pickupLongitude", row.path("pickupPoint").path("longitude"));
        }
        return orders.transition(order.id, DomainEnums.OrderStatus.valueOf(status), csv.input(data, ApiModels.TransitionInput.class));
    }

    private InventoryOrder returnQuantities(CsvImportJob job, JsonNode row, UUID id, ObjectNode quantities, boolean cumulative) {
        if (quantities.isEmpty()) throw ApiException.badRequest("Returned quantities are missing");
        var order = csv.json(queries.orderDetail(id));
        var input = csv.object().put("idempotencyKey", key(job, row, "return").toString());
        var lines = input.putObject("lines");
        var returnedAssets = input.putObject("assets");
        for (var entry : quantities.properties()) {
            int quantity = entry.getValue().asInt();
            // Order preview rows describe the desired total; standalone return rows are individual movements.
            if (cumulative) quantity -= order.path("returnedQuantities").path(entry.getKey()).asInt();
            if (quantity <= 0) continue;
            lines.putObject(entry.getKey()).put("returned", quantity).put("damaged", 0).put("missing", 0).put("writtenOff", 0);
            int selected = 0;
            for (var assetId : order.path("assetAssignments").path(entry.getKey())) {
                if (selected >= quantity) break;
                var asset = queries.itemAssets(UUID.fromString(entry.getKey())).stream().filter(candidate -> candidate.id().toString().equals(assetId.asText())).findFirst().orElse(null);
                if (asset != null && Set.of("in_field", "in_custody", "lost").contains(asset.availabilityStatus())) {
                    returnedAssets.putObject(assetId.asText()).put("outcome", "returned_good"); selected++;
                }
            }
        }
        return lines.isEmpty() ? catalog.find(InventoryOrder.class, id) : orders.returnItems(id, csv.input(input, ApiModels.ReturnInput.class));
    }

    public void standaloneReturn(CsvImportJob job, JsonNode row) {
        UUID itemId = csv.itemId(job, row.path("itemId"));
        int quantity = CsvImportSupport.integer(row.path("quantity"));
        if (!row.path("generalOrderName").asText().isBlank()) {
            var matching = generalOrders().stream().filter(order -> order.name().equalsIgnoreCase(row.path("generalOrderName").asText())
                    && (!row.path("date").isNumber() || EpochTime.millis(catalog.find(org.ash.inventory.operations.internal.model.EventOccurrence.class,
                            UUID.fromString(order.eventOccurrenceId())).startDate) == row.path("date").asLong())).toList();
            if (matching.size() != 1) throw ApiException.badRequest("General order not found or ambiguous");
            var order = matching.getFirst();
            if (Set.of("returned", "closed").contains(order.status())) return;
            returnQuantities(job, row, order.id(), csv.object().put(itemId.toString(), quantity), false);
        } else if (catalog.getVisibleItem(itemId).trackingMode == DomainEnums.TrackingMode.serialized) {
            var assets = assets(itemId);
            if (row.path("assetCodes").size() != quantity) throw ApiException.badRequest("Asset codes must match the return quantity");
            boolean recorded = false;
            for (var code : row.path("assetCodes")) {
                var asset = assets.stream().filter(candidate -> candidate.assetCode().equalsIgnoreCase(code.asText())).findFirst()
                        .orElseThrow(() -> ApiException.badRequest("Asset not found: " + code.asText()));
                if (asset.availabilityStatus().equals("available")) continue;
                transact(job, row, itemId, 1, asset.id(), "checkin");
                recorded = true;
            }
            if (!recorded) return;
        } else {
            if (!previous(row, itemId, "checkin").isEmpty()) return;
            var item = catalog.getVisibleItem(itemId);
            if (inventory.stock(item).checkedOut() == 0) return;
            transact(job, row, itemId, quantity, null, "checkin");
        }
        csv.increment(job, "successReturns");
    }

    public void checkout(CsvImportJob job, JsonNode row) {
        UUID itemId = csv.itemId(job, row.path("itemId"));
        int quantity = CsvImportSupport.integer(row.path("quantity"));
        var imported = previous(row, itemId, "checkout");
        int alreadyImported = imported.stream().mapToInt(ApiResponses.TransactionResponse::quantityChanged).sum();
        if (alreadyImported >= quantity) return;
        if (catalog.getVisibleItem(itemId).trackingMode == DomainEnums.TrackingMode.serialized) {
            var assets = assets(itemId);
            var selected = new ArrayList<ApiResponses.AssetInstanceResponse>();
            if (row.path("assetCodes").size() > 0) {
                for (var code : row.path("assetCodes")) selected.add(assets.stream().filter(asset -> asset.assetCode().equalsIgnoreCase(code.asText()))
                        .findFirst().orElseThrow(() -> ApiException.badRequest("Asset not found: " + code.asText())));
            } else selected.addAll(assets.stream().filter(asset -> asset.availabilityStatus().equals("available")).limit(quantity - alreadyImported).toList());
            int expected = row.path("assetCodes").size() > 0 ? quantity : quantity - alreadyImported;
            if (selected.size() != expected || selected.stream().map(ApiResponses.AssetInstanceResponse::id).distinct().count() != expected
                    || selected.stream().anyMatch(asset -> !asset.availabilityStatus().equals("available")
                            && imported.stream().noneMatch(tx -> Objects.equals(tx.assetInstanceId(), asset.id().toString())))) throw ApiException.badRequest("Not enough matching available assets");
            for (var asset : selected) if (imported.stream().noneMatch(tx -> Objects.equals(tx.assetInstanceId(), asset.id().toString()))) transact(job, row, itemId, 1, asset.id(), "checkout");
        } else transact(job, row, itemId, quantity, null, "checkout");
        csv.increment(job, "successCheckouts");
    }

    private List<ApiResponses.AssetInstanceResponse> assets(UUID id) { return CsvImportSupport.all((page, size) -> queries.itemAssets(id, page, size)); }
    private UUID key(CsvImportJob job, JsonNode row, String action) { return CsvImportSupport.command(job.id + ":" + job.cursor + ":" + action); }
    private String marker(JsonNode row, UUID item, String type) {
        var identity = csv.copy(row);
        identity.put("itemId", item.toString());
        identity.remove(List.of("status", "statusMessage"));
        return "CSV " + type + " " + CsvImportSupport.command(identity.toString());
    }
    private List<ApiResponses.TransactionResponse> previous(JsonNode row, UUID item, String type) {
        String marker = marker(row, item, type);
        return CsvImportSupport.all((page, size) -> queries.transactions(item, null, null, null, type, null, null, marker, page, size));
    }
    private void transact(CsvImportJob job, JsonNode row, UUID item, int quantity, UUID asset, String type) {
        String marker = marker(row, item, type);
        var data = csv.object().put("itemId", item.toString()).put("quantityChanged", quantity).put("transactionType", type)
                .put("reason", "CSV import " + type).put("notes", marker + ": " + row.path("notes").asText(""))
                .put("idempotencyKey", CsvImportSupport.command(marker + ":" + asset).toString());
        if (asset != null) data.put("assetInstanceId", asset.toString());
        if (row.path("eventType").isTextual()) data.set("eventType", row.path("eventType"));
        if (row.path("faction").isTextual()) data.set("faction", row.path("faction"));
        inventory.transact(csv.input(data, ApiModels.TransactionInput.class));
    }
}

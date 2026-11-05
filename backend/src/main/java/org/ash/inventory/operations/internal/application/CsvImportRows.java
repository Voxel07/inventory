package org.ash.inventory.operations.internal.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.EventLogisticsDtos;
import org.ash.inventory.operations.internal.model.CsvImportJob;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.EpochTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@ApplicationScoped
public class CsvImportRows {
    @Inject CsvImportSupport csv;
    @Inject CatalogService catalog;
    @Inject InventoryOperationsService inventory;
    @Inject StockManagementService stock;
    @Inject EventLogisticsService logistics;
    @Inject CsvImportOrders orders;
    @Inject CsvImportOperations operations;

    public void apply(CsvImportJob job, JsonNode step) {
        JsonNode row = step.path("row");
        switch (step.path("kind").asText()) {
            case "skip" -> { }
            case "faction" -> faction(job, row);
            case "item" -> item(job, row);
            case "assembly" -> {
                var data = csv.copy(row.path("data"));
                data.set("itemQuantities", csv.quantities(job, row.path("components")));
                catalog.createAssembly(csv.input(data, ApiModels.AssemblyInput.class));
                csv.increment(job, "successAssemblies");
            }
            case "event" -> event(job, row, false);
            case "closeEvent" -> event(job, row, true);
            case "order" -> orders.faction(job, row);
            case "generalOrder" -> orders.general(job, row);
            case "return" -> orders.standaloneReturn(job, row);
            case "checkout" -> orders.checkout(job, row);
            case "operation" -> { operations.apply(job, row); csv.increment(job, "successOperations"); }
            default -> throw ApiException.badRequest("Unknown CSV import step");
        }
    }

    private void faction(CsvImportJob job, JsonNode row) {
        var known = catalog.getFactions(row.path("eventType").asText()).stream()
                .filter(faction -> faction.name.trim().equalsIgnoreCase(row.path("name").asText())).findFirst();
        var saved = known.orElseGet(() -> catalog.createFaction(csv.input(row, ApiModels.FactionInput.class)));
        csv.remember(job, "factions", row.path("id").asText(), saved.id);
    }

    private void item(CsvImportJob job, JsonNode row) {
        var data = csv.copy(row.path("data"));
        if (row.path("storageLocationPath").isArray() && row.path("storageLocationId").asText().isBlank()) {
            var location = csv.locationPath(row.path("storageLocationPath"), row.path("autoCreateLocations").asBoolean());
            if (location != null) data.put("storageLocation", location.toString());
        }
        var codes = row.path("assetCodes");
        boolean existing = row.path("isExisting").asBoolean();
        if (existing) data.remove("amount");
        else if (codes.size() > 0 || row.path("lots").size() > 0) data.put("amount", 0);
        var entry = csv.object();
        if (existing) entry.set("id", row.path("existingId"));
        entry.set("item", data);
        if (codes.isArray()) entry.set("assetCodes", codes);
        var saved = catalog.saveItems(List.of(csv.input(entry, ApiModels.ItemBatchEntry.class))).getFirst();
        csv.remember(job, "items", "csv-new-" + row.path("index").asText(), saved.id);
        for (var source : row.path("lots")) {
            var lot = csv.copy(source);
            var quantity = lot.remove("quantity");
            var known = CsvImportSupport.all((page, size) -> stock.lots(saved.id, page, size)).stream()
                    .filter(candidate -> candidate.lotNumber.equalsIgnoreCase(lot.path("lotNumber").asText())).findFirst();
            var transaction = csv.object().put("itemId", saved.id.toString()).put("transactionType", "adjusted")
                    .put("reason", "CSV lot opening stock").put("quantityChanged", CsvImportSupport.integer(quantity));
            if (saved.storageLocation != null) transaction.put("locationId", saved.storageLocation.id.toString());
            if (known.isPresent()) transaction.put("lotId", known.get().id.toString()); else transaction.set("newLot", lot);
            var identity = csv.array().add("lot-opening-stock").add(saved.id.toString()).add(lot.path("lotNumber").asText());
            if (saved.storageLocation == null) identity.addNull(); else identity.add(saved.storageLocation.id.toString());
            transaction.put("idempotencyKey", CsvImportSupport.command(identity.toString()).toString());
            inventory.transact(csv.input(transaction, ApiModels.TransactionInput.class));
        }
        csv.increment(job, existing ? "updatedItems" : "successItems");
    }

    private void event(CsvImportJob job, JsonNode row, boolean close) {
        var data = csv.copy(row.path("data"));
        var date = data.path("startDate").isNumber() ? data.path("startDate") : data.path("eventDate");
        data.set("startDate", date);
        if (!data.path("endDate").isNumber()) data.set("endDate", date);
        data.set("plannedQuantities", csv.quantities(job, row.path("plannedItems")));
        data.set("usedQuantities", csv.quantities(job, row.path("usedItems")));
        var existing = catalog.getEvents(data.path("eventType").asText()).stream()
                .filter(event -> EpochTime.millis(event.startDate) == date.asLong()).findFirst();
        if (close) {
            // A failed opening step must not close an unrelated existing event.
            var saved = job.context.path("events").path(row.path("index").asText());
            if (saved.isMissingNode()) return;
            if (existing.isEmpty() || !existing.get().id.equals(CsvImportSupport.id(saved))) throw ApiException.badRequest("Imported event no longer exists");
            if (row.path("usedItems").isEmpty()) data.remove("usedQuantities");
            catalog.updateEvent(existing.get().id, csv.input(data, ApiModels.EventInput.class));
            return;
        }
        if (data.path("status").asText().equals("completed")) data.put("status", "planned");
        var input = csv.input(data, ApiModels.EventInput.class);
        var saved = existing.map(event -> catalog.updateEvent(event.id, input)).orElseGet(() -> catalog.createEvent(input));
        importLogistics(job, saved, row);
        csv.remember(job, "events", row.path("index").asText(), saved.id);
        csv.increment(job, "successEvents");
    }

    private void importLogistics(CsvImportJob job, EventOccurrence event, JsonNode row) {
        if (!row.path("attendees").isEmpty()) {
            var people = new java.util.ArrayList<>(logistics.people());
            var attendees = new java.util.ArrayList<>(logistics.attendees(event.id));
            for (var source : row.path("attendees")) {
                var data = csv.copy(source);
                var matches = people.stream().filter(person -> person.name().trim().equalsIgnoreCase(data.path("personName").asText())).toList();
                if (matches.size() > 1) throw ApiException.badRequest("Ambiguous attendee name: " + data.path("personName").asText());
                var person = matches.isEmpty() ? null : matches.getFirst();
                if (person != null) {
                    data.put("personId", person.id().toString());
                    if (person.userId() == null) data.putNull("personUserId"); else data.put("personUserId", person.userId().toString());
                    data.put("personName", person.name());
                }
                for (var role : data.path("roles")) {
                    var id = job.context.path("factions").path(role.path("factionId").asText());
                    if (id.isTextual()) ((ObjectNode)role).set("factionId", id);
                }
                var known = person == null ? null : attendees.stream().filter(attendee -> attendee.person().id().equals(person.id())).findFirst().orElse(null);
                var saved = logistics.saveAttendee(event.id, known == null ? null : known.id(), csv.input(data, EventLogisticsDtos.AttendeeInput.class));
                attendees.removeIf(attendee -> attendee.id().equals(saved.id())); attendees.add(saved);
                if (person == null) people.add(new EventLogisticsDtos.PersonResponse(saved.person().id(), saved.person().name(), saved.person().userId(), saved.person().userName(), 1));
            }
        }
        if (!row.path("timeline").isEmpty()) {
            var timeline = new java.util.ArrayList<>(logistics.timeline(event.id));
            for (var source : row.path("timeline")) {
                var input = csv.input(source, EventLogisticsDtos.TimelineInput.class);
                var existing = timeline.stream().filter(entry -> entry.category().equals(input.category()) && entry.title().equals(input.title())
                        && Objects.equals(entry.startsAt(), input.startsAt())).findFirst();
                var saved = logistics.saveTimeline(event.id, existing.map(EventLogisticsDtos.TimelineResponse::id).orElse(null), input);
                timeline.removeIf(entry -> entry.id().equals(saved.id())); timeline.add(saved);
            }
        }
    }
}

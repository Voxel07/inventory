package org.ash.inventory.operations.internal.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.CountDtos;
import org.ash.inventory.operations.internal.contract.dto.LifecycleDtos;
import org.ash.inventory.operations.internal.contract.dto.PurchasingDtos;
import org.ash.inventory.operations.internal.contract.dto.TransferDtos;
import org.ash.inventory.operations.internal.model.CsvImportJob;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.platform.api.ApiException;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class CsvImportOperations {
    @Inject CsvImportSupport csv;
    @Inject InventoryOperationsService inventory;
    @Inject StockManagementService stock;
    @Inject LifecycleService lifecycle;
    @Inject PurchasingService purchasing;
    @Inject EquipmentService equipment;
    @Inject LoanService loans;
    @Inject TransferService transfers;
    @Inject CountService counts;
    @Inject MemberService members;

    public void apply(CsvImportJob job, JsonNode row) {
        var data = csv.copy(csv.resolve(job, row.path("data"), null));
        UUID key = CsvImportSupport.command(row.path("name").asText());
        data.put("idempotencyKey", key.toString());
        UUID result;
        switch (row.path("operation").asText()) {
            case "stock" -> {
                UUID item = CsvImportSupport.id(data.path("itemId"));
                String lotNumber = data.path("newLot").path("lotNumber").asText(data.path("lotNumber").asText());
                if (!lotNumber.isBlank()) {
                    var lot = CsvImportSupport.all((page, size) -> stock.lots(item, page, size)).stream()
                            .filter(entry -> entry.lotNumber.equalsIgnoreCase(lotNumber)).findFirst();
                    if (lot.isPresent()) { data.put("lotId", lot.get().id.toString()); data.remove("newLot"); }
                    else if (!data.path("newLot").isObject()) throw ApiException.badRequest("Inventory lot not found: " + lotNumber);
                }
                result = inventory.transact(csv.input(data, ApiModels.TransactionInput.class)).id;
            }
            case "damage" -> result = inventory.reportDamage(csv.input(data, ApiModels.DamageInput.class)).id;
            case "repair" -> result = lifecycle.createRepair(csv.input(data, LifecycleDtos.RepairInput.class)).id;
            case "repair_transition" -> {
                var repair = CsvImportSupport.all((page, size) -> lifecycle.repairs(null, page, size)).stream()
                        .filter(entry -> entry.id.equals(CsvImportSupport.id(data.path("repairId")))).findFirst()
                        .orElseThrow(() -> ApiException.badRequest("Repair case not found"));
                var stages = List.of("reported", "triaged", "awaiting_repair", "in_repair", "repaired", "verified", "returned_to_service");
                String target = data.path("status").asText();
                boolean complete = repair.status.name().equals(target)
                        || stages.contains(target) && stages.indexOf(repair.status.name()) > stages.indexOf(target)
                        || repair.status == DomainEnums.RepairStatus.written_off && Set.of("triaged", "awaiting_repair", "in_repair").contains(target);
                result = complete ? repair.id : lifecycle.transitionRepair(repair.id, csv.input(data, LifecycleDtos.RepairTransitionInput.class)).id;
            }
            case "maintenance" -> {
                var input = csv.input(data, LifecycleDtos.ScheduleInput.class);
                var existing = CsvImportSupport.all((page, size) -> lifecycle.schedules(null, null, page, size)).stream()
                        .filter(entry -> entry.item.id.equals(input.itemId())
                                && Objects.equals(entry.assetInstance == null ? null : entry.assetInstance.id, input.assetInstanceId())
                                && entry.maintenanceType == input.maintenanceType() && entry.intervalType == input.intervalType()).findFirst();
                result = existing.isPresent() ? existing.get().id : lifecycle.createSchedule(input).id;
            }
            case "purchase" -> result = purchase(data);
            case "receipt" -> result = receipt(data);
            case "equipment" -> {
                UUID item = CsvImportSupport.id(data.path("itemId"));
                var profile = equipment.get(item);
                data.put("revision", profile.revision());
                var before = csv.json(profile);
                boolean changed = data.properties().stream().anyMatch(entry -> !Set.of("itemId", "reason", "revision", "idempotencyKey").contains(entry.getKey())
                        && !Objects.equals(before.path(entry.getKey()), entry.getValue()));
                if (changed) equipment.update(item, csv.input(data, EquipmentService.ProfileInput.class));
                result = item;
            }
            case "commitment" -> {
                UUID item = CsvImportSupport.id(data.path("itemId"));
                var profile = equipment.get(item);
                data.put("revision", profile.revision());
                var input = csv.input(data, EquipmentService.CommitmentInput.class);
                var existing = profile.commitments().stream().filter(entry -> !entry.status().equals("cancelled")
                        && entry.availableFrom().equals(input.availableFrom()) && entry.availableUntil().equals(input.availableUntil())
                        && entry.quantity() == input.quantity() && Objects.equals(entry.eventId(), input.eventId())).findFirst();
                if (existing.isPresent()) result = existing.get().id();
                else result = equipment.commit(item, input).commitments().stream().filter(entry -> profile.commitments().stream().noneMatch(prior -> prior.id().equals(entry.id())))
                        .map(EquipmentService.CommitmentView::id).findFirst().orElseThrow(() -> ApiException.badRequest("Commitment not found"));
            }
            case "loan" -> {
                var input = csv.input(data, LoanService.Input.class);
                var existing = CsvImportSupport.all(loans::list).stream().filter(entry -> entry.commitmentId().equals(input.commitmentId())).findFirst();
                result = existing.isPresent() ? existing.get().id() : loans.create(input).id();
            }
            case "loan_collect" -> {
                var loan = CsvImportSupport.all(loans::list).stream().filter(entry -> entry.id().equals(CsvImportSupport.id(data.path("loanId")))).findFirst()
                        .orElseThrow(() -> ApiException.badRequest("Loan agreement not found"));
                data.put("revision", loan.revision());
                result = loan.collected() >= loan.quantity() ? loan.id() : loans.move(loan.id(), csv.input(data, LoanService.Movement.class), false).id();
            }
            case "transfer" -> {
                var transfer = transfers.create(csv.input(data, TransferDtos.TransferInput.class));
                if (data.path("status").asText().equals("received")) {
                    if (Set.of("requested", "picking").contains(transfer.status())) transfer = transfers.dispatch(transfer.id(),
                            new TransferDtos.CommandInput(CsvImportSupport.command(row.path("name").asText() + ":dispatch"), data.path("notes").asText(null)));
                    if (transfer.status().equals("in_transit")) transfer = transfers.receive(transfer.id(), new TransferDtos.ReceiveInput(
                            CsvImportSupport.command(row.path("name").asText() + ":receive"), transfer.lines().stream()
                                .map(line -> new TransferDtos.ReceiveLineInput(line.id(), line.pickedQuantity(), 0, null)).toList(), data.path("notes").asText(null)));
                }
                result = transfer.id();
            }
            case "count" -> {
                var existing = CsvImportSupport.all((page, size) -> counts.list(null, page, size)).stream()
                        .filter(entry -> entry.sessionNumber().equals(data.path("sessionNumber").asText())).findFirst();
                result = existing.isPresent() ? existing.get().id() : counts.create(csv.input(data, CountDtos.CountInput.class)).id();
            }
            case "member_request" -> {
                data.put("commandId", key.toString());
                result = members.request(csv.input(data, MemberService.RequestInput.class)).id();
            }
            case "member_return" -> {
                var custody = members.custodyRows().stream().filter(entry -> entry.itemId().equals(CsvImportSupport.id(data.path("itemId")))
                        && entry.checkedOut() >= data.path("quantity").asInt()).findFirst()
                        .orElseThrow(() -> ApiException.badRequest("No own custody found for this return"));
                data.put("custodyKey", custody.key()).put("commandId", key.toString());
                if (custody.assetInstanceId() != null) data.put("assetId", custody.assetInstanceId().toString());
                result = members.submitReturn(csv.input(data, MemberService.ReturnInput.class));
            }
            default -> throw ApiException.badRequest("Unknown CSV operation");
        }
        csv.remember(job, "outputs", row.path("name").asText(), result);
    }

    private UUID purchase(ObjectNode data) {
        String name = data.path("vendorName").asText();
        var existing = CsvImportSupport.all((page, size) -> purchasing.vendors(null, page, size)).stream().filter(vendor -> vendor.name().equals(name)).findFirst();
        var vendor = existing.orElseGet(() -> purchasing.createVendor(csv.input(csv.object().put("name", name), PurchasingDtos.VendorInput.class)));
        data.put("vendorId", vendor.id().toString());
        var known = CsvImportSupport.all((page, size) -> purchasing.purchaseOrders(null, page, size)).stream()
                .filter(order -> order.orderNumber().equals(data.path("orderNumber").asText())).findFirst();
        var order = known.orElseGet(() -> purchasing.createPurchaseOrder(csv.input(data, PurchasingDtos.PurchaseOrderInput.class)));
        if (data.path("status").asText().equals("ordered") && order.status().equals("draft")) order = purchasing.transitionPurchaseOrder(order.id(),
                new PurchasingDtos.PurchaseOrderTransitionInput(DomainEnums.PurchaseOrderStatus.ordered, null));
        return order.id();
    }

    private UUID receipt(ObjectNode data) {
        var order = CsvImportSupport.all((page, size) -> purchasing.purchaseOrders(null, page, size)).stream()
                .filter(entry -> entry.id().equals(CsvImportSupport.id(data.path("purchaseOrderId")))).findFirst()
                .orElseThrow(() -> ApiException.badRequest("Purchase order not found"));
        for (var source : data.path("lines")) {
            var line = (ObjectNode)source;
            var purchaseLine = order.lines().stream().filter(entry -> entry.itemId().equals(CsvImportSupport.id(line.path("itemId")))).findFirst()
                    .orElseThrow(() -> ApiException.badRequest("Received item is missing from the purchase order"));
            line.put("purchaseOrderLineId", purchaseLine.id().toString());
        }
        return purchasing.postReceipt(csv.input(data, PurchasingDtos.GoodsReceiptInput.class)).id();
    }
}

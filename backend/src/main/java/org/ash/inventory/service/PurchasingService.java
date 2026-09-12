package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.helper.storage.MediaService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.PurchasingOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.PurchasingDtos;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class PurchasingService {
    private final PurchasingOrm orm;
    private final ActorService actors;
    private final DomainEventService events;
    private final MediaService media;

    public PurchasingService(PurchasingOrm orm, ActorService actors, DomainEventService events, MediaService media) {
        this.orm = orm;
        this.actors = actors;
        this.events = events;
        this.media = media;
    }

    @Transactional
    public List<PurchasingDtos.VendorResponse> vendors(int page, int size) {
        actors.requireWarehouse();
        return orm.vendors(offset(page, size), size).stream().map(this::vendor).toList();
    }

    @Transactional
    public PurchasingDtos.VendorResponse createVendor(PurchasingDtos.VendorInput input) {
        actors.requireWarehouse();
        if (orm.vendorNameExists(input.name(), null)) throw ApiException.conflict("Vendor name already exists");
        var value = new Vendor();
        apply(value, input);
        orm.persist(value);
        events.record("vendor.created", "vendor", value.id, actors.current().id, null, Map.of("name", value.name));
        return vendor(value);
    }

    @Transactional
    public PurchasingDtos.VendorResponse updateVendor(UUID id, PurchasingDtos.VendorInput input) {
        actors.requireWarehouse();
        var value = requiredLocked(Vendor.class, id, "Vendor");
        if (orm.vendorNameExists(input.name(), id)) throw ApiException.conflict("Vendor name already exists");
        apply(value, input);
        events.record("vendor.updated", "vendor", value.id, actors.current().id, null, Map.of("name", value.name));
        return vendor(value);
    }

    @Transactional
    public void retireVendor(UUID id) {
        actors.requireWarehouse();
        var value = requiredLocked(Vendor.class, id, "Vendor");
        value.active = false;
        events.record("vendor.retired", "vendor", value.id, actors.current().id, null, Map.of("name", value.name));
    }

    @Transactional
    public List<PurchasingDtos.PurchaseOrderResponse> purchaseOrders(String status, int page, int size) {
        actors.requireWarehouse();
        List<PurchaseOrder> values;
        try {
            values = orm.purchaseOrders(status, offset(page, size), size);
        } catch (IllegalArgumentException exception) {
            throw ApiException.badRequest("Unknown purchase order status");
        }
        return purchaseOrderResponses(values);
    }

    @Transactional
    public PurchasingDtos.PurchaseOrderResponse createPurchaseOrder(PurchasingDtos.PurchaseOrderInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var vendor = required(Vendor.class, input.vendorId(), "Vendor");
        if (!vendor.active) throw ApiException.conflict("Vendor is inactive");
        var order = new PurchaseOrder();
        order.orderNumber = uniqueOrderNumber(input.orderNumber());
        order.vendor = vendor;
        order.orderDate = input.orderDate() == null ? LocalDate.now() : input.orderDate();
        order.expectedDeliveryDate = input.expectedDeliveryDate();
        if (order.expectedDeliveryDate != null && order.expectedDeliveryDate.isBefore(order.orderDate)) {
            throw ApiException.badRequest("Expected delivery date cannot precede order date");
        }
        order.eventOccurrence = input.eventOccurrenceId() == null ? null
                : required(EventOccurrence.class, input.eventOccurrenceId(), "Event occurrence");
        order.createdBy = actor;
        order.notes = input.notes();
        orm.persist(order);
        var lines = replaceLines(order, input.lines());
        events.record("purchase_order.created", "purchase_order", order.id, actor.id, null,
                Map.of("orderNumber", order.orderNumber));
        return purchaseOrder(order, lines);
    }

    @Transactional
    public PurchasingDtos.PurchaseOrderResponse updatePurchaseOrder(UUID id, PurchasingDtos.PurchaseOrderInput input) {
        actors.requireWarehouse();
        var order = requiredLocked(PurchaseOrder.class, id, "Purchase order");
        if (order.status != DomainEnums.PurchaseOrderStatus.draft) {
            throw ApiException.conflict("Only draft purchase orders can be edited");
        }
        var vendor = required(Vendor.class, input.vendorId(), "Vendor");
        if (!vendor.active) throw ApiException.conflict("Vendor is inactive");
        order.vendor = vendor;
        if (input.orderDate() != null) order.orderDate = input.orderDate();
        order.expectedDeliveryDate = input.expectedDeliveryDate();
        if (order.expectedDeliveryDate != null && order.expectedDeliveryDate.isBefore(order.orderDate)) {
            throw ApiException.badRequest("Expected delivery date cannot precede order date");
        }
        order.eventOccurrence = input.eventOccurrenceId() == null ? null
                : required(EventOccurrence.class, input.eventOccurrenceId(), "Event occurrence");
        order.notes = input.notes();
        orm.removePurchaseOrderLines(order);
        var lines = replaceLines(order, input.lines());
        events.record("purchase_order.updated", "purchase_order", order.id, actors.current().id, null,
                Map.of("orderNumber", order.orderNumber));
        return purchaseOrder(order, lines);
    }

    @Transactional
    public PurchasingDtos.PurchaseOrderResponse transitionPurchaseOrder(UUID id,
            PurchasingDtos.PurchaseOrderTransitionInput input) {
        actors.requireWarehouse();
        var order = requiredLocked(PurchaseOrder.class, id, "Purchase order");
        boolean allowed = switch (order.status) {
            case draft -> input.status() == DomainEnums.PurchaseOrderStatus.ordered
                    || input.status() == DomainEnums.PurchaseOrderStatus.cancelled;
            case ordered, partially_received -> input.status() == DomainEnums.PurchaseOrderStatus.cancelled;
            case received -> input.status() == DomainEnums.PurchaseOrderStatus.closed;
            default -> false;
        };
        if (!allowed) throw ApiException.conflict("Invalid purchase order transition: " + order.status + " -> " + input.status());
        order.status = input.status();
        if (input.notes() != null) order.notes = input.notes();
        events.record("purchase_order." + order.status.name(), "purchase_order", order.id,
                actors.current().id, null, Map.of("orderNumber", order.orderNumber));
        return purchaseOrder(order, orm.purchaseOrderLines(List.of(order)));
    }

    @Transactional
    public List<PurchasingDtos.GoodsReceiptResponse> receipts(UUID purchaseOrderId, int page, int size) {
        actors.requireWarehouse();
        return receiptResponses(orm.receipts(purchaseOrderId, offset(page, size), size));
    }

    @Transactional
    public PurchasingDtos.GoodsReceiptResponse postReceipt(PurchasingDtos.GoodsReceiptInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var existing = orm.receiptByIdempotencyKey(input.idempotencyKey());
        if (existing != null) return receiptResponses(List.of(existing)).getFirst();

        var order = requiredLocked(PurchaseOrder.class, input.purchaseOrderId(), "Purchase order");
        if (order.status != DomainEnums.PurchaseOrderStatus.ordered
                && order.status != DomainEnums.PurchaseOrderStatus.partially_received) {
            throw ApiException.conflict("Purchase order is not open for receiving");
        }
        var location = required(StorageLocation.class, input.receivingLocationId(), "Receiving location");
        if (!location.active) throw ApiException.conflict("Receiving location is inactive");
        var receipt = new GoodsReceipt();
        receipt.receiptNumber = uniqueReceiptNumber(input.receiptNumber());
        receipt.purchaseOrder = order;
        receipt.receivedBy = actor;
        receipt.receivedAt = input.receivedAt() == null ? Instant.now() : input.receivedAt();
        receipt.receivingLocation = location;
        receipt.idempotencyKey = input.idempotencyKey();
        receipt.notes = input.notes();
        orm.persist(receipt);

        var orderLines = orm.lockedPurchaseOrderLines(order);
        var byId = new LinkedHashMap<UUID, PurchaseOrderLine>();
        orderLines.forEach(line -> byId.put(line.id, line));
        var seen = new HashSet<UUID>();
        var receiptLines = new ArrayList<GoodsReceiptLine>();
        long acceptedTotal = 0;
        long damagedTotal = 0;
        long rejectedTotal = 0;
        for (var inputLine : input.lines()) {
            if (!seen.add(inputLine.purchaseOrderLineId())) {
                throw ApiException.badRequest("A purchase order line can occur only once per receipt");
            }
            var orderLine = byId.get(inputLine.purchaseOrderLineId());
            if (orderLine == null) throw ApiException.badRequest("Receipt line does not belong to purchase order");
            long processed = (long) inputLine.acceptedQuantity() + inputLine.damagedQuantity()
                    + inputLine.rejectedQuantity();
            if (processed < 1) throw ApiException.badRequest("Receipt line must contain at least one processed unit");
            long received = (long) inputLine.acceptedQuantity() + inputLine.damagedQuantity();
            if (received > Integer.MAX_VALUE) {
                throw ApiException.badRequest("Receipt line quantity is too large");
            }
            int stockReceived = (int) received;
            if (stockReceived > orderLine.remainingQuantity()) {
                throw ApiException.conflict("Received quantity exceeds the remaining quantity for " + orderLine.item.name);
            }
            var lot = validateReceiptTracking(orderLine.item, inputLine, stockReceived);
            var line = new GoodsReceiptLine();
            line.goodsReceipt = receipt;
            line.purchaseOrderLine = orderLine;
            line.item = orderLine.item;
            line.lot = lot;
            line.expectedQuantity = orderLine.remainingQuantity();
            line.receivedQuantity = inputLine.acceptedQuantity();
            line.damagedQuantity = inputLine.damagedQuantity();
            line.rejectedQuantity = inputLine.rejectedQuantity();
            line.receivingNotes = inputLine.receivingNotes();
            orm.persist(line);
            receiptLines.add(line);

            receiveStock(receipt, line, location, inputLine.assetCodes(), actor);
            orderLine.receivedQuantity += stockReceived;
            acceptedTotal += inputLine.acceptedQuantity();
            damagedTotal += inputLine.damagedQuantity();
            rejectedTotal += inputLine.rejectedQuantity();
        }

        receipt.status = acceptedTotal + damagedTotal == 0
                ? DomainEnums.GoodsReceiptStatus.rejected
                : damagedTotal > 0 || rejectedTotal > 0
                        ? DomainEnums.GoodsReceiptStatus.partially_accepted
                        : DomainEnums.GoodsReceiptStatus.posted;
        boolean complete = orderLines.stream().allMatch(line -> line.remainingQuantity() == 0);
        order.status = complete ? DomainEnums.PurchaseOrderStatus.received : DomainEnums.PurchaseOrderStatus.partially_received;
        events.record("goods_receipt.posted", "goods_receipt", receipt.id, actor.id, input.idempotencyKey(),
                Map.of("purchaseOrderId", order.id.toString(), "accepted", acceptedTotal,
                        "damaged", damagedTotal, "rejected", rejectedTotal));
        return receipt(receipt, receiptLines);
    }

    @Transactional
    public List<PurchasingDtos.VendorDocumentResponse> documents(UUID vendorId, UUID purchaseOrderId,
            int page, int size) {
        actors.requireWarehouse();
        return orm.documents(vendorId, purchaseOrderId, offset(page, size), size).stream()
                .map(this::document).toList();
    }

    @Transactional
    public PurchasingDtos.VendorDocumentResponse attachDocument(PurchasingDtos.VendorDocumentInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var vendor = required(Vendor.class, input.vendorId(), "Vendor");
        var order = input.purchaseOrderId() == null ? null
                : required(PurchaseOrder.class, input.purchaseOrderId(), "Purchase order");
        var receipt = input.goodsReceiptId() == null ? null
                : required(GoodsReceipt.class, input.goodsReceiptId(), "Goods receipt");
        if (order != null && !order.vendor.id.equals(vendor.id)) {
            throw ApiException.badRequest("Purchase order does not belong to vendor");
        }
        if (receipt != null && !receipt.purchaseOrder.vendor.id.equals(vendor.id)) {
            throw ApiException.badRequest("Goods receipt does not belong to vendor");
        }
        if (receipt != null && order != null && !receipt.purchaseOrder.id.equals(order.id)) {
            throw ApiException.badRequest("Goods receipt does not belong to purchase order");
        }
        if (input.currency() != null && !input.currency().isBlank() && input.currency().trim().length() != 3) {
            throw ApiException.badRequest("Currency must be a three-letter code");
        }
        var value = new VendorDocument();
        value.vendor = vendor;
        value.purchaseOrder = order;
        value.goodsReceipt = receipt;
        value.documentType = input.documentType();
        value.originalFilename = input.originalFilename().trim();
        value.documentDate = input.documentDate();
        value.referenceNumber = input.referenceNumber();
        value.totalAmountCents = input.totalAmountCents();
        value.currency = input.currency() == null || input.currency().isBlank() ? null
                : input.currency().trim().toUpperCase(Locale.ROOT);
        value.uploadedBy = actor;
        value.uploadedAt = Instant.now();
        value.retentionUntil = input.retentionUntil();
        value.notes = input.notes();
        orm.persist(value);
        var stored = media.attachToVendorDocument(input.stagedObjectKey(), value.id, value.originalFilename);
        value.objectStorageKey = stored.key();
        value.mimeType = stored.contentType();
        value.fileSize = stored.contentLength();
        value.checksum = stored.checksum();
        events.record("vendor_document.attached", "vendor_document", value.id, actor.id, null,
                Map.of("vendorId", vendor.id.toString(), "documentType", value.documentType.name()));
        return document(value);
    }

    private InventoryLot validateReceiptTracking(Item item, PurchasingDtos.ReceiptLineInput input, int stockReceived) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            var codes = input.assetCodes() == null ? List.<String>of() : input.assetCodes();
            if (codes.size() != stockReceived) {
                throw ApiException.badRequest("Provide exactly one asset code for every received serialized unit of " + item.name);
            }
            var unique = new HashSet<String>();
            for (var raw : codes) {
                var code = requiredText(raw, "assetCode").toUpperCase(Locale.ROOT);
                if (!unique.add(code) || orm.assetCodeExists(code)) throw ApiException.conflict("Asset code already exists: " + code);
            }
            if (input.lotId() != null) throw ApiException.badRequest("Serialized receipt lines cannot reference a lot");
            return null;
        }
        if (input.assetCodes() != null && !input.assetCodes().isEmpty()) {
            throw ApiException.badRequest("Asset codes are only valid for serialized receipt lines");
        }
        if (item.trackingMode == DomainEnums.TrackingMode.lot_tracked) {
            if (input.lotId() == null) throw ApiException.badRequest("lotId is required for lot-tracked receipts");
            var lot = required(InventoryLot.class, input.lotId(), "Inventory lot");
            if (!lot.item.id.equals(item.id)) throw ApiException.badRequest("Lot does not belong to receipt item");
            return lot;
        }
        if (input.lotId() != null) throw ApiException.badRequest("Bulk receipt lines cannot reference a lot");
        return null;
    }

    private void receiveStock(GoodsReceipt receipt, GoodsReceiptLine line, StorageLocation location,
            List<String> assetCodes, UserAccount actor) {
        int stockReceived = line.receivedQuantity + line.damagedQuantity;
        if (line.item.trackingMode == DomainEnums.TrackingMode.serialized) {
            for (int index = 0; index < stockReceived; index++) {
                var asset = new AssetInstance();
                asset.item = line.item;
                asset.assetCode = assetCodes.get(index).trim().toUpperCase(Locale.ROOT);
                asset.currentLocation = location;
                boolean damaged = index >= line.receivedQuantity;
                asset.conditionStatus = damaged ? DomainEnums.ConditionStatus.damaged : DomainEnums.ConditionStatus.good;
                asset.availabilityStatus = damaged ? DomainEnums.AssetState.damaged : DomainEnums.AssetState.available;
                orm.persist(asset);
                appendTransaction(receipt, line, asset, location, DomainEnums.TransactionType.received, 1,
                        derivedKey(receipt.idempotencyKey, line.purchaseOrderLine.id + ":received:" + index), actor);
                if (damaged) recordReceiptDamage(receipt, line, asset, actor, index);
            }
            return;
        }
        if (stockReceived > 0) {
            var position = orm.lockedPosition(line.item, location, line.lot);
            if (position == null) {
                position = new InventoryPosition();
                position.item = line.item;
                position.location = location;
                position.lot = line.lot;
                orm.persist(position);
            }
            position.quantityOnHand += stockReceived;
            position.quantityDamaged += line.damagedQuantity;
            appendTransaction(receipt, line, null, location, DomainEnums.TransactionType.received,
                    stockReceived, derivedKey(receipt.idempotencyKey, line.purchaseOrderLine.id + ":received"), actor);
            if (line.damagedQuantity > 0) recordReceiptDamage(receipt, line, null, actor, 0);
        }
    }

    private void recordReceiptDamage(GoodsReceipt receipt, GoodsReceiptLine line, AssetInstance asset,
            UserAccount actor, int index) {
        var damage = new DamageReport();
        damage.item = line.item;
        damage.assetInstance = asset;
        damage.reporter = actor;
        damage.quantity = asset == null ? line.damagedQuantity : 1;
        damage.description = "Damaged on receipt " + receipt.receiptNumber;
        damage.severity = DomainEnums.DamageSeverity.medium;
        damage.idempotencyKey = derivedKey(receipt.idempotencyKey,
                line.purchaseOrderLine.id + ":damage:" + index);
        orm.persist(damage);
        appendTransaction(receipt, line, asset, receipt.receivingLocation, DomainEnums.TransactionType.damaged,
                damage.quantity, derivedKey(receipt.idempotencyKey,
                        line.purchaseOrderLine.id + ":damage-transaction:" + index), actor).damageReport = damage;
    }

    private StockTransaction appendTransaction(GoodsReceipt receipt, GoodsReceiptLine line, AssetInstance asset,
            StorageLocation location, DomainEnums.TransactionType type, int quantity, UUID key, UserAccount actor) {
        var transaction = new StockTransaction();
        transaction.item = line.item;
        transaction.assetInstance = asset;
        transaction.user = actor;
        transaction.type = type;
        transaction.quantity = quantity;
        transaction.destinationLocation = location;
        transaction.relatedEntityType = "goods_receipt";
        transaction.relatedEntityId = receipt.id;
        transaction.reason = "Goods receipt " + receipt.receiptNumber;
        transaction.idempotencyKey = key;
        transaction.clientCommandId = receipt.idempotencyKey;
        orm.persist(transaction);
        return transaction;
    }

    private List<PurchaseOrderLine> replaceLines(PurchaseOrder order,
            List<PurchasingDtos.PurchaseOrderLineInput> inputs) {
        var itemIds = new HashSet<UUID>();
        var result = new ArrayList<PurchaseOrderLine>();
        for (var input : inputs) {
            if (!itemIds.add(input.itemId())) throw ApiException.badRequest("Each item may occur only once per purchase order");
            var line = new PurchaseOrderLine();
            line.purchaseOrder = order;
            line.item = required(Item.class, input.itemId(), "Item");
            if (!line.item.active) throw ApiException.conflict("Purchase order item is inactive");
            line.orderedQuantity = input.orderedQuantity();
            line.unitPriceCents = input.unitPriceCents();
            line.notes = input.notes();
            orm.persist(line);
            result.add(line);
        }
        return result;
    }

    private List<PurchasingDtos.PurchaseOrderResponse> purchaseOrderResponses(List<PurchaseOrder> values) {
        var linesByOrder = new LinkedHashMap<UUID, List<PurchaseOrderLine>>();
        orm.purchaseOrderLines(values).forEach(line ->
                linesByOrder.computeIfAbsent(line.purchaseOrder.id, ignored -> new ArrayList<>()).add(line));
        return values.stream().map(value -> purchaseOrder(value,
                linesByOrder.getOrDefault(value.id, List.of()))).toList();
    }

    private PurchasingDtos.PurchaseOrderResponse purchaseOrder(PurchaseOrder value, List<PurchaseOrderLine> lines) {
        return new PurchasingDtos.PurchaseOrderResponse(value.id, value.orderNumber, value.vendor.id,
                value.vendor.name, value.orderDate, value.expectedDeliveryDate, value.status.name(),
                value.eventOccurrence == null ? null : value.eventOccurrence.id, value.createdBy.id, value.notes,
                lines.stream().map(line -> new PurchasingDtos.PurchaseOrderLineResponse(line.id, line.item.id,
                        line.item.sku, line.item.name, line.orderedQuantity, line.unitPriceCents,
                        line.receivedQuantity, line.remainingQuantity(), line.notes)).toList());
    }

    private List<PurchasingDtos.GoodsReceiptResponse> receiptResponses(List<GoodsReceipt> values) {
        var linesByReceipt = new LinkedHashMap<UUID, List<GoodsReceiptLine>>();
        orm.receiptLines(values).forEach(line ->
                linesByReceipt.computeIfAbsent(line.goodsReceipt.id, ignored -> new ArrayList<>()).add(line));
        return values.stream().map(value -> receipt(value,
                linesByReceipt.getOrDefault(value.id, List.of()))).toList();
    }

    private PurchasingDtos.GoodsReceiptResponse receipt(GoodsReceipt value, List<GoodsReceiptLine> lines) {
        return new PurchasingDtos.GoodsReceiptResponse(value.id, value.receiptNumber, value.purchaseOrder.id,
                value.receivedBy.id, value.receivedAt, value.receivingLocation.id, value.status.name(),
                value.idempotencyKey, value.notes,
                lines.stream().map(line -> new PurchasingDtos.GoodsReceiptLineResponse(line.id,
                        line.purchaseOrderLine.id, line.item.id, line.item.name, line.expectedQuantity,
                        line.receivedQuantity, line.damagedQuantity, line.rejectedQuantity,
                        line.lot == null ? null : line.lot.id, line.receivingNotes)).toList());
    }

    private PurchasingDtos.VendorResponse vendor(Vendor value) {
        return new PurchasingDtos.VendorResponse(value.id, value.name, value.contactPerson, value.email,
                value.phone, value.address, value.website, value.paymentNotes, value.preferredVendor,
                value.internalNotes, value.active);
    }

    private PurchasingDtos.VendorDocumentResponse document(VendorDocument value) {
        return new PurchasingDtos.VendorDocumentResponse(value.id, value.vendor.id,
                value.purchaseOrder == null ? null : value.purchaseOrder.id,
                value.goodsReceipt == null ? null : value.goodsReceipt.id, value.documentType.name(),
                value.originalFilename, value.mimeType, value.objectStorageKey, value.fileSize,
                value.checksum, value.documentDate, value.referenceNumber, value.totalAmountCents,
                value.currency, value.uploadedBy.id, value.uploadedAt, value.retentionUntil, value.notes);
    }

    private void apply(Vendor value, PurchasingDtos.VendorInput input) {
        value.name = input.name().trim();
        value.contactPerson = input.contactPerson();
        value.email = input.email();
        value.phone = input.phone();
        value.address = input.address();
        value.website = input.website();
        value.paymentNotes = input.paymentNotes();
        value.preferredVendor = input.preferredVendor();
        value.internalNotes = input.internalNotes();
        if (input.active() != null) value.active = input.active();
    }

    private String uniqueOrderNumber(String requested) {
        var number = requested == null || requested.isBlank()
                ? "PO-" + LocalDate.now().getYear() + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT)
                : requested.trim();
        if (orm.orderNumberExists(number)) throw ApiException.conflict("Purchase order number already exists");
        return number;
    }

    private String uniqueReceiptNumber(String requested) {
        var number = requested == null || requested.isBlank()
                ? "GR-" + LocalDate.now().getYear() + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT)
                : requested.trim();
        if (orm.receiptNumberExists(number)) throw ApiException.conflict("Receipt number already exists");
        return number;
    }

    private UUID derivedKey(UUID base, String suffix) {
        return UUID.nameUUIDFromBytes((base + ":" + suffix).getBytes(StandardCharsets.UTF_8));
    }

    private int offset(int page, int size) {
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid page bounds");
        try { return Math.multiplyExact(page, size); }
        catch (ArithmeticException exception) { throw ApiException.badRequest("Page offset is too large"); }
    }

    private String requiredText(String value, String field) {
        if (value == null || value.isBlank()) throw ApiException.badRequest(field + " is required");
        return value.trim();
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        var value = orm.find(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }
    private <T> T requiredLocked(Class<T> type, UUID id, String label) {
        var value = orm.locked(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }
}

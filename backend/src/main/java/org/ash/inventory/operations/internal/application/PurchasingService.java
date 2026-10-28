package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.contract.dto.PurchasingDtos;
import org.ash.inventory.operations.internal.media.MediaService;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.GoodsReceipt;
import org.ash.inventory.operations.internal.model.GoodsReceiptLine;
import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.PurchaseOrder;
import org.ash.inventory.operations.internal.model.PurchaseOrderLine;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.Vendor;
import org.ash.inventory.operations.internal.model.VendorDocument;
import org.ash.inventory.operations.internal.persistence.PurchasingOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.BusinessTime;
import org.ash.inventory.platform.api.PageBounds;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class PurchasingService {
    @jakarta.inject.Inject InventoryReceiptService stockReceipts;
    @jakarta.inject.Inject StockManagementService lots;
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
    public List<PurchasingDtos.VendorResponse> vendors(String search, int page, int size) {
        actors.requireWarehouse();
        return orm.vendors(search, PageBounds.of(page, size).offset(), size).stream().map(this::vendor).toList();
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
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
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public PurchasingDtos.VendorResponse updateVendor(UUID id, PurchasingDtos.VendorInput input) {
        actors.requireWarehouse();
        var value = orm.requireLocked(Vendor.class, id, "Vendor");
        if (orm.vendorNameExists(input.name(), id)) throw ApiException.conflict("Vendor name already exists");
        apply(value, input);
        events.record("vendor.updated", "vendor", value.id, actors.current().id, null, Map.of("name", value.name));
        return vendor(value);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public void retireVendor(UUID id) {
        actors.requireWarehouse();
        var value = orm.requireLocked(Vendor.class, id, "Vendor");
        value.active = false;
        events.record("vendor.retired", "vendor", value.id, actors.current().id, null, Map.of("name", value.name));
    }

    @Transactional
    public List<PurchasingDtos.PurchaseOrderResponse> purchaseOrders(String status, int page, int size) {
        actors.requireWarehouse();
        List<PurchaseOrder> values;
        try {
            values = orm.purchaseOrders(status, PageBounds.of(page, size).offset(), size);
        } catch (IllegalArgumentException exception) {
            throw ApiException.badRequest("Unknown purchase order status");
        }
        return purchaseOrderResponses(values);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public PurchasingDtos.PurchaseOrderResponse createPurchaseOrder(PurchasingDtos.PurchaseOrderInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var vendor = orm.require(Vendor.class, input.vendorId(), "Vendor");
        if (!vendor.active) throw ApiException.conflict("Vendor is inactive");
        var order = new PurchaseOrder();
        order.orderNumber = uniqueOrderNumber(input.orderNumber());
        order.vendor = vendor;
        order.orderDate = input.orderDate() == null ? BusinessTime.today() : input.orderDate();
        order.expectedDeliveryDate = input.expectedDeliveryDate();
        if (order.expectedDeliveryDate != null && order.expectedDeliveryDate.isBefore(order.orderDate)) {
            throw ApiException.badRequest("Expected delivery date cannot precede order date");
        }
        order.eventOccurrence = input.eventOccurrenceId() == null ? null
                : orm.require(EventOccurrence.class, input.eventOccurrenceId(), "Event occurrence");
        order.createdBy = actor;
        order.notes = input.notes();
        orm.persist(order);
        var lines = replaceLines(order, input.lines());
        events.record("purchase_order.created", "purchase_order", order.id, actor.id, null,
                Map.of("orderNumber", order.orderNumber));
        return purchaseOrder(order, lines);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public PurchasingDtos.PurchaseOrderResponse updatePurchaseOrder(UUID id, PurchasingDtos.PurchaseOrderInput input) {
        actors.requireWarehouse();
        var order = orm.requireLocked(PurchaseOrder.class, id, "Purchase order");
        if (order.status != DomainEnums.PurchaseOrderStatus.draft) {
            throw ApiException.conflict("Only draft purchase orders can be edited");
        }
        var vendor = orm.require(Vendor.class, input.vendorId(), "Vendor");
        if (!vendor.active) throw ApiException.conflict("Vendor is inactive");
        order.vendor = vendor;
        if (input.orderDate() != null) order.orderDate = input.orderDate();
        order.expectedDeliveryDate = input.expectedDeliveryDate();
        if (order.expectedDeliveryDate != null && order.expectedDeliveryDate.isBefore(order.orderDate)) {
            throw ApiException.badRequest("Expected delivery date cannot precede order date");
        }
        order.eventOccurrence = input.eventOccurrenceId() == null ? null
                : orm.require(EventOccurrence.class, input.eventOccurrenceId(), "Event occurrence");
        order.notes = input.notes();
        orm.removePurchaseOrderLines(order);
        var lines = replaceLines(order, input.lines());
        events.record("purchase_order.updated", "purchase_order", order.id, actors.current().id, null,
                Map.of("orderNumber", order.orderNumber));
        return purchaseOrder(order, lines);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public PurchasingDtos.PurchaseOrderResponse transitionPurchaseOrder(UUID id,
            PurchasingDtos.PurchaseOrderTransitionInput input) {
        actors.requireWarehouse();
        var order = orm.requireLocked(PurchaseOrder.class, id, "Purchase order");
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
        return receiptResponses(orm.receipts(purchaseOrderId, PageBounds.of(page, size).offset(), size));
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public PurchasingDtos.GoodsReceiptResponse postReceipt(PurchasingDtos.GoodsReceiptInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var existing = orm.receiptByIdempotencyKey(input.idempotencyKey());
        if (existing != null) return receiptResponses(List.of(existing)).getFirst();

        var order = orm.requireLocked(PurchaseOrder.class, input.purchaseOrderId(), "Purchase order");
        if (order.status != DomainEnums.PurchaseOrderStatus.ordered
                && order.status != DomainEnums.PurchaseOrderStatus.partially_received) {
            throw ApiException.conflict("Purchase order is not open for receiving");
        }
        var location = orm.require(StorageLocation.class, input.receivingLocationId(), "Receiving location");
        if (!location.active) throw ApiException.conflict("Receiving location is inactive");
        LocationHierarchyService.requireStockLocation(location);
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
        var stock = new ArrayList<InventoryReceiptService.ReceiptStock>();
        var assetCodes = new HashSet<String>();
        var newLots = new HashMap<String, InventoryLot>();
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
            var lot = validateReceiptTracking(orderLine.item, inputLine, stockReceived, assetCodes, newLots);
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

            stock.add(new InventoryReceiptService.ReceiptStock(receipt.id, receipt.receiptNumber, receipt.idempotencyKey,
                    line.purchaseOrderLine.id, line.item.id, line.lot == null ? null : line.lot.id, location.id,
                    line.receivedQuantity, line.damagedQuantity, inputLine.assetCodes()));
            orderLine.receivedQuantity += stockReceived;
            acceptedTotal += inputLine.acceptedQuantity();
            damagedTotal += inputLine.damagedQuantity();
            rejectedTotal += inputLine.rejectedQuantity();
        }
        // One call: inventory locks all receipt items canonically before booking any line.
        stockReceipts.receive(stock);

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
        return orm.documents(vendorId, purchaseOrderId, PageBounds.of(page, size).offset(), size).stream()
                .map(this::document).toList();
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public PurchasingDtos.VendorDocumentResponse attachDocument(PurchasingDtos.VendorDocumentInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var vendor = orm.require(Vendor.class, input.vendorId(), "Vendor");
        var order = input.purchaseOrderId() == null ? null
                : orm.require(PurchaseOrder.class, input.purchaseOrderId(), "Purchase order");
        var receipt = input.goodsReceiptId() == null ? null
                : orm.require(GoodsReceipt.class, input.goodsReceiptId(), "Goods receipt");
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
        var inspected = media.inspectVendorDocument(input.stagedObjectKey());
        // Queries in attachment authorization can flush pending inserts.
        // Persist a complete row before attaching the upload to its generated ID.
        value.objectStorageKey = inspected.key();
        value.mimeType = inspected.contentType();
        value.fileSize = inspected.contentLength();
        value.checksum = inspected.checksum();
        orm.persist(value);
        var stored = media.attachToVendorDocument(inspected, value.id, value.originalFilename);
        value.objectStorageKey = stored.key();
        value.mimeType = stored.contentType();
        value.fileSize = stored.contentLength();
        value.checksum = stored.checksum();
        events.record("vendor_document.attached", "vendor_document", value.id, actor.id, null,
                Map.of("vendorId", vendor.id.toString(), "documentType", value.documentType.name()));
        return document(value);
    }

    /**
     * {@code receiptCodes} spans the whole receipt: assets are booked only after every line validated. A new lot is
     * created here, with the stock it receives; {@code newLots} lets two lines of one delivery share that new lot.
     */
    private InventoryLot validateReceiptTracking(Item item, PurchasingDtos.ReceiptLineInput input, int stockReceived,
            Set<String> receiptCodes, Map<String, InventoryLot> newLots) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            var codes = input.assetCodes() == null ? List.<String>of() : input.assetCodes();
            if (codes.size() != stockReceived) {
                throw ApiException.badRequest("Provide exactly one asset code for every received serialized unit of " + item.name);
            }
            for (var raw : codes) {
                var code = requiredText(raw, "assetCode").toUpperCase(Locale.ROOT);
                if (!receiptCodes.add(code) || orm.assetCodeExists(code)) throw ApiException.conflict("Asset code already exists: " + code);
            }
            if (input.lotId() != null || input.newLot() != null) throw ApiException.badRequest("Serialized receipt lines cannot reference a lot");
            return null;
        }
        if (input.assetCodes() != null && !input.assetCodes().isEmpty()) {
            throw ApiException.badRequest("Asset codes are only valid for serialized receipt lines");
        }
        if (item.trackingMode == DomainEnums.TrackingMode.lot_tracked) {
            if (input.newLot() != null) {
                if (input.lotId() != null) throw ApiException.badRequest("Choose an existing lot or a new lot, not both");
                if (stockReceived < 1) throw ApiException.badRequest("A new lot needs received stock");
                var number = input.newLot().lotNumber() == null ? "" : input.newLot().lotNumber().trim().toLowerCase(Locale.ROOT);
                var created = newLots.get(item.id + ":" + number);
                if (created == null) {
                    created = lots.newLot(item, input.newLot());
                    newLots.put(item.id + ":" + number, created);
                }
                return created;
            }
            if (input.lotId() == null) throw ApiException.badRequest("lotId or newLot is required for lot-tracked receipts");
            var lot = orm.require(InventoryLot.class, input.lotId(), "Inventory lot");
            if (!lot.item.id.equals(item.id)) throw ApiException.badRequest("Lot does not belong to receipt item");
            return lot;
        }
        if (input.lotId() != null || input.newLot() != null) throw ApiException.badRequest("Bulk receipt lines cannot reference a lot");
        return null;
    }

    private List<PurchaseOrderLine> replaceLines(PurchaseOrder order,
            List<PurchasingDtos.PurchaseOrderLineInput> inputs) {
        var itemIds = new HashSet<UUID>();
        var result = new ArrayList<PurchaseOrderLine>();
        for (var input : inputs) {
            if (!itemIds.add(input.itemId())) throw ApiException.badRequest("Each item may occur only once per purchase order");
            var line = new PurchaseOrderLine();
            line.purchaseOrder = order;
            line.item = orm.require(Item.class, input.itemId(), "Item");
            if (!line.item.active) throw ApiException.conflict("Purchase order item is inactive");
            line.orderedQuantity = input.orderedQuantity();
            line.unitPriceCents = input.unitPriceCents();
            line.notes = input.notes();
            orm.persist(line);
            result.add(line);
        }
        linkItemRequests(order, itemIds);
        return result;
    }

    /**
     * Requests whose item is on this purchase order count as ordered: a line dropped by an edit releases its
     * requests, and requests still waiting for their item are taken up, whichever screen drafted the order.
     */
    private void linkItemRequests(PurchaseOrder order, Set<UUID> itemIds) {
        for (var request : orm.itemRequests(order))
            if (!itemIds.contains(request.item.id)) request.purchaseOrder = null;
        var eventId = order.eventOccurrence == null ? null : order.eventOccurrence.id;
        for (var request : orm.itemRequestsAwaitingPurchase(itemIds, eventId)) request.purchaseOrder = order;
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
                value.eventOccurrence == null ? null : value.eventOccurrence.id, value.createdBy.id,
                value.createdBy.name, value.notes,
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
                ? "PO-" + BusinessTime.today().getYear() + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT)
                : requested.trim();
        if (orm.orderNumberExists(number)) throw ApiException.conflict("Purchase order number already exists");
        return number;
    }

    private String uniqueReceiptNumber(String requested) {
        var number = requested == null || requested.isBlank()
                ? "GR-" + BusinessTime.today().getYear() + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT)
                : requested.trim();
        if (orm.receiptNumberExists(number)) throw ApiException.conflict("Receipt number already exists");
        return number;
    }

    private UUID derivedKey(UUID base, String suffix) {
        return UUID.nameUUIDFromBytes((base + ":" + suffix).getBytes(StandardCharsets.UTF_8));
    }

    private String requiredText(String value, String field) {
        if (value == null || value.isBlank()) throw ApiException.badRequest(field + " is required");
        return value.trim();
    }

}

package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.GoodsReceipt;
import org.ash.inventory.operations.internal.model.GoodsReceiptLine;
import org.ash.inventory.operations.internal.model.OrderItemRequest;
import org.ash.inventory.operations.internal.model.PurchaseOrder;
import org.ash.inventory.operations.internal.model.PurchaseOrderLine;
import org.ash.inventory.operations.internal.model.Vendor;
import org.ash.inventory.operations.internal.model.VendorDocument;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.VendorItemSource;
import org.ash.inventory.operations.internal.model.VendorSourceScan;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.UUID;

@ApplicationScoped
public class PurchasingOrm extends EntityOrm {
    @jakarta.inject.Inject InventoryAccessOrm privacyScopes;

    public List<Vendor> vendors(String search, int offset, int limit) {
        boolean searching = search != null && !search.isBlank();
        var query = entityManager.createQuery("from Vendor vendor"
                + (searching ? " where lower(vendor.name) like :search escape '!'" : "")
                + " order by vendor.active desc, vendor.preferredVendor desc, vendor.name, vendor.id", Vendor.class);
        if (searching) query.setParameter("search", org.ash.inventory.platform.api.Inputs.containsPattern(search));
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public boolean vendorNameExists(String name, UUID excluding) {
        var jpql = excluding == null
                ? "select count(vendor) from Vendor vendor where lower(vendor.name) = :name"
                : "select count(vendor) from Vendor vendor where lower(vendor.name) = :name and vendor.id <> :excluding";
        var query = entityManager.createQuery(jpql, Long.class)
                .setParameter("name", name.trim().toLowerCase(Locale.ROOT));
        if (excluding != null) query.setParameter("excluding", excluding);
        return query.getSingleResult() > 0;
    }

    /** Serializes item link scans, so two runs never create the same generated supplier twice. */
    public void lockVendorSourceScan() {
        entityManager.createNativeQuery("select 1 from pg_advisory_xact_lock(659743254)").getSingleResult();
    }
    public List<Vendor> allVendors() {
        return entityManager.createQuery("from Vendor vendor order by vendor.active desc, vendor.preferredVendor desc, vendor.name, vendor.id", Vendor.class)
                .getResultList();
    }
    /** Active organization items with a purchase link; privately owned items never feed shared suppliers. */
    public List<Item> itemsWithPurchaseLinks() {
        return entityManager.createQuery("select item from Item item where item.active = true and item.accessPolicy is null"
                + " and item.purchaseUrl is not null order by item.name, item.id", Item.class).getResultList();
    }
    public void removeVendorItemSources() {
        entityManager.createQuery("delete from VendorItemSource").executeUpdate();
    }
    /** Links of the last scan whose item the actor may see and that is still active. */
    public List<VendorItemSource> vendorItemSources() {
        var query = entityManager.createQuery("select source from VendorItemSource source join fetch source.vendor vendor"
                + " join fetch source.item item where item.active = true" + InventoryAccessOrm.scope("item", "item")
                + " order by lower(vendor.name), vendor.id, lower(item.name), item.id", VendorItemSource.class);
        return InventoryAccessOrm.bind(query, accessActor.current()).getResultList();
    }
    /** Organization item links added, changed or removed since the last scan. */
    public long changedPurchaseLinks() {
        var added = entityManager.createQuery("select count(item) from Item item where item.active = true and item.accessPolicy is null"
                + " and item.purchaseUrl is not null and not exists (select 1 from VendorItemSource source"
                + " where source.item = item and source.url = item.purchaseUrl)", Long.class).getSingleResult();
        var removed = entityManager.createQuery("select count(source) from VendorItemSource source join source.item item"
                + " where item.active = false or item.purchaseUrl is null", Long.class).getSingleResult();
        return added + removed;
    }
    public VendorSourceScan lastVendorSourceScan() {
        return entityManager.createQuery("select scan from VendorSourceScan scan join fetch scan.actor order by scan.createdAt desc, scan.id desc", VendorSourceScan.class)
                .setMaxResults(1).getResultStream().findFirst().orElse(null);
    }

    public List<PurchaseOrder> purchaseOrders(String status, int offset, int limit) {

        var jpql = status == null || status.isBlank()
                ? "select purchaseOrder from PurchaseOrder purchaseOrder join fetch purchaseOrder.vendor join fetch purchaseOrder.createdBy left join fetch purchaseOrder.eventOccurrence where 1=1" + InventoryAccessOrm.scope("purchase", "purchaseOrder") + " order by purchaseOrder.orderDate desc, purchaseOrder.createdAt desc"
                : "select purchaseOrder from PurchaseOrder purchaseOrder join fetch purchaseOrder.vendor join fetch purchaseOrder.createdBy left join fetch purchaseOrder.eventOccurrence where purchaseOrder.status = :status" + InventoryAccessOrm.scope("purchase", "purchaseOrder") + " order by purchaseOrder.orderDate desc, purchaseOrder.createdAt desc";
        var query = entityManager.createQuery(jpql, PurchaseOrder.class);
        if (status != null && !status.isBlank()) query.setParameter("status", DomainEnums.PurchaseOrderStatus.valueOf(status));
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public boolean orderNumberExists(String number) {
        return entityManager.createQuery("select count(purchaseOrder) from PurchaseOrder purchaseOrder where lower(purchaseOrder.orderNumber) = :number", Long.class)
                .setParameter("number", number.toLowerCase(Locale.ROOT)).getSingleResult() > 0;
    }
    public List<PurchaseOrderLine> purchaseOrderLines(Collection<PurchaseOrder> orders) {
        if (orders.isEmpty()) return List.of();
        return entityManager.createQuery("select line from PurchaseOrderLine line join fetch line.item where line.purchaseOrder in :orders order by line.createdAt", PurchaseOrderLine.class)
                .setParameter("orders", orders).getResultList();
    }
    public Map<UUID, Integer> outstandingQuantities(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return Map.of();
        var rows = entityManager.createQuery("select line.item.id, sum(line.orderedQuantity - line.receivedQuantity) "
                        + "from PurchaseOrderLine line where line.item.id in :itemIds "
                        + "and line.purchaseOrder.status in :statuses group by line.item.id", Object[].class)
                .setParameter("itemIds", itemIds)
                .setParameter("statuses", List.of(DomainEnums.PurchaseOrderStatus.ordered,
                        DomainEnums.PurchaseOrderStatus.partially_received))
                .getResultList();
        var result = new LinkedHashMap<UUID, Integer>();
        for (var row : rows) result.put((UUID) row[0], Math.max(0, Math.toIntExact(((Number) row[1]).longValue())));
        return result;
    }
    public List<PurchaseOrderLine> lockedPurchaseOrderLines(PurchaseOrder order) {
        return entityManager.createQuery("select line from PurchaseOrderLine line join fetch line.item where line.purchaseOrder = :order order by line.createdAt", PurchaseOrderLine.class)
                .setParameter("order", order).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }
    public List<OrderItemRequest> itemRequests(PurchaseOrder order) {
        return entityManager.createQuery("from OrderItemRequest request where request.purchaseOrder = :order order by request.createdAt, request.lineNumber, request.id", OrderItemRequest.class)
                .setParameter("order", order).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }

    /** Linked, undeclined requests without a live purchase order; {@code eventId} skips orders of other events. */
    public List<OrderItemRequest> itemRequestsAwaitingPurchase(Collection<UUID> itemIds, UUID eventId) {
        if (itemIds.isEmpty()) return List.of();
        var query = entityManager.createQuery("select request from OrderItemRequest request join request.order o"
                + " left join request.purchaseOrder purchase where request.item.id in :itemIds and request.declinedAt is null"
                + " and request.receivedQuantity < request.quantity and o.status <> cancelled and (purchase is null or purchase.status = cancelled)"
                + (eventId == null ? "" : " and (o.eventOccurrence is null or o.eventOccurrence.id = :eventId)")
                + " order by request.createdAt, request.lineNumber, request.id", OrderItemRequest.class)
                .setParameter("itemIds", itemIds);
        if (eventId != null) query.setParameter("eventId", eventId);
        return query.setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }

    public void removePurchaseOrderLines(PurchaseOrder order) {
        entityManager.createQuery("delete from PurchaseOrderLine line where line.purchaseOrder = :order")
                .setParameter("order", order).executeUpdate();
    }

    public GoodsReceipt receiptByIdempotencyKey(UUID key) {
        return entityManager.createQuery("select receipt from GoodsReceipt receipt join fetch receipt.purchaseOrder join fetch receipt.receivedBy join fetch receipt.receivingLocation where receipt.idempotencyKey = :key", GoodsReceipt.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }
    public List<GoodsReceipt> receipts(UUID purchaseOrderId, int offset, int limit) {

        var jpql = purchaseOrderId == null
                ? "select receipt from GoodsReceipt receipt join fetch receipt.purchaseOrder join fetch receipt.receivedBy join fetch receipt.receivingLocation where 1=1" + InventoryAccessOrm.scope("receipt", "receipt") + " order by receipt.receivedAt desc"
                : "select receipt from GoodsReceipt receipt join fetch receipt.purchaseOrder join fetch receipt.receivedBy join fetch receipt.receivingLocation where receipt.purchaseOrder.id = :purchaseOrderId" + InventoryAccessOrm.scope("receipt", "receipt") + " order by receipt.receivedAt desc";
        var query = entityManager.createQuery(jpql, GoodsReceipt.class);
        if (purchaseOrderId != null) query.setParameter("purchaseOrderId", purchaseOrderId);
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public List<GoodsReceiptLine> receiptLines(Collection<GoodsReceipt> receipts) {
        if (receipts.isEmpty()) return List.of();
        return entityManager.createQuery("select line from GoodsReceiptLine line join fetch line.purchaseOrderLine join fetch line.item left join fetch line.lot where line.goodsReceipt in :receipts order by line.createdAt", GoodsReceiptLine.class)
                .setParameter("receipts", receipts).getResultList();
    }
    public boolean receiptNumberExists(String number) {
        return entityManager.createQuery("select count(receipt) from GoodsReceipt receipt where lower(receipt.receiptNumber) = :number", Long.class)
                .setParameter("number", number.toLowerCase(Locale.ROOT)).getSingleResult() > 0;
    }
    public boolean assetCodeExists(String code) {
        return entityManager.createQuery("select count(asset) from AssetInstance asset where lower(asset.assetCode) = :code", Long.class)
                .setParameter("code", code.toLowerCase(Locale.ROOT)).getSingleResult() > 0;
    }
    public List<VendorDocument> documents(UUID vendorId, UUID purchaseOrderId, int offset, int limit) {
        var jpql = new StringBuilder("select document from VendorDocument document join fetch document.vendor left join fetch document.purchaseOrder left join fetch document.goodsReceipt join fetch document.uploadedBy where 1=1");
        if (vendorId != null) jpql.append(" and document.vendor.id = :vendorId");
        if (purchaseOrderId != null) jpql.append(" and document.purchaseOrder.id = :purchaseOrderId");
        jpql.append(" order by document.uploadedAt desc");
        var query = entityManager.createQuery(jpql.toString(), VendorDocument.class);
        if (vendorId != null) query.setParameter("vendorId", vendorId);
        if (purchaseOrderId != null) query.setParameter("purchaseOrderId", purchaseOrderId);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }
}

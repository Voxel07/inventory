package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.*;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.UUID;

@ApplicationScoped
public class PurchasingOrm {
    private final EntityManager entityManager;

    public PurchasingOrm(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public void persist(Object value) { entityManager.persist(value); }
    public <T> T find(Class<T> type, UUID id) { return entityManager.find(type, id); }
    public <T> T locked(Class<T> type, UUID id) { return entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE); }

    public List<Vendor> vendors(int offset, int limit) {
        return entityManager.createQuery("from Vendor vendor order by vendor.active desc, vendor.preferredVendor desc, vendor.name", Vendor.class)
                .setFirstResult(offset).setMaxResults(limit).getResultList();
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

    public List<PurchaseOrder> purchaseOrders(String status, int offset, int limit) {
        var jpql = status == null || status.isBlank()
                ? "select purchaseOrder from PurchaseOrder purchaseOrder join fetch purchaseOrder.vendor join fetch purchaseOrder.createdBy left join fetch purchaseOrder.eventOccurrence order by purchaseOrder.orderDate desc, purchaseOrder.createdAt desc"
                : "select purchaseOrder from PurchaseOrder purchaseOrder join fetch purchaseOrder.vendor join fetch purchaseOrder.createdBy left join fetch purchaseOrder.eventOccurrence where purchaseOrder.status = :status order by purchaseOrder.orderDate desc, purchaseOrder.createdAt desc";
        var query = entityManager.createQuery(jpql, PurchaseOrder.class);
        if (status != null && !status.isBlank()) query.setParameter("status", DomainEnums.PurchaseOrderStatus.valueOf(status));
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
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
                ? "select receipt from GoodsReceipt receipt join fetch receipt.purchaseOrder join fetch receipt.receivedBy join fetch receipt.receivingLocation order by receipt.receivedAt desc"
                : "select receipt from GoodsReceipt receipt join fetch receipt.purchaseOrder join fetch receipt.receivedBy join fetch receipt.receivingLocation where receipt.purchaseOrder.id = :purchaseOrderId order by receipt.receivedAt desc";
        var query = entityManager.createQuery(jpql, GoodsReceipt.class);
        if (purchaseOrderId != null) query.setParameter("purchaseOrderId", purchaseOrderId);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
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
    public InventoryPosition lockedPosition(Item item, StorageLocation location, InventoryLot lot) {
        var jpql = lot == null
                ? "from InventoryPosition position where position.item = :item and position.location = :location and position.lot is null"
                : "from InventoryPosition position where position.item = :item and position.location = :location and position.lot = :lot";
        var query = entityManager.createQuery(jpql, InventoryPosition.class)
                .setParameter("item", item).setParameter("location", location);
        if (lot != null) query.setParameter("lot", lot);
        return query.setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultStream().findFirst().orElse(null);
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

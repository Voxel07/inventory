package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Something an order asks for that the inventory does not hold yet. Procurement links an item (which adds an
 * order line), orders it from a supplier or declines it; the status follows from those links.
 */
@Entity
@Table(name = "order_item_requests")
public class OrderItemRequest extends BaseEntity {
    public enum Status { open, item_created, ordered, received, declined }

    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_id") public InventoryOrder order;
    /** Order of the requests as the requester listed them. */
    @Column(name = "line_number", nullable = false) public int lineNumber;
    @Column(nullable = false, length = 160) public String name;
    @Column(nullable = false) public int quantity;
    @Column(length = 2000) public String link;
    @Column(length = 2000) public String note;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "purchase_order_id") public PurchaseOrder purchaseOrder;
    @Column(name = "decline_reason", length = 2000) public String declineReason;
    @Column(name = "declined_at") public Instant declinedAt;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "resolved_by") public UserAccount resolvedBy;

    /** A cancelled purchase order no longer counts, so the request waits for a new one. */
    public boolean ordered() {
        return purchaseOrder != null && purchaseOrder.status != DomainEnums.PurchaseOrderStatus.cancelled;
    }

    public Status status() {
        if (declinedAt != null) return Status.declined;
        if (ordered()) return purchaseOrder.status == DomainEnums.PurchaseOrderStatus.received
                || purchaseOrder.status == DomainEnums.PurchaseOrderStatus.closed ? Status.received : Status.ordered;
        if (item != null) return Status.item_created;
        return Status.open;
    }
}

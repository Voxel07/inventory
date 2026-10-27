package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "purchase_order_lines", uniqueConstraints =
        @UniqueConstraint(name = "uq_purchase_order_item", columnNames = {"purchase_order_id", "item_id"}))
public class PurchaseOrderLine extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "purchase_order_id") public PurchaseOrder purchaseOrder;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @Column(name = "ordered_quantity", nullable = false) public int orderedQuantity;
    /** Price of one full unit; percentage quantities contain 100 steps per full unit. */
    @Column(name = "unit_price_cents", nullable = false) public int unitPriceCents;

    public long orderedValueCents() {
        return java.math.BigDecimal.valueOf(orderedQuantity).multiply(java.math.BigDecimal.valueOf(unitPriceCents))
                .movePointLeft(item.quantityDecimals).setScale(0, java.math.RoundingMode.HALF_UP).longValueExact();
    }
    @Column(name = "received_quantity", nullable = false) public int receivedQuantity;
    public String notes;

    public int remainingQuantity() { return Math.max(0, orderedQuantity - receivedQuantity); }
}

package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "goods_receipt_lines")
public class GoodsReceiptLine extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "goods_receipt_id") public GoodsReceipt goodsReceipt;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "purchase_order_line_id") public PurchaseOrderLine purchaseOrderLine;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "lot_id") public InventoryLot lot;
    @Column(name = "expected_quantity", nullable = false) public int expectedQuantity;
    @Column(name = "received_quantity", nullable = false) public int receivedQuantity;
    @Column(name = "damaged_quantity", nullable = false) public int damagedQuantity;
    @Column(name = "rejected_quantity", nullable = false) public int rejectedQuantity;
    @Column(name = "receiving_notes") public String receivingNotes;
}

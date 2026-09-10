package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "goods_receipts")
public class GoodsReceipt extends BaseEntity {
    @Column(name = "receipt_number", nullable = false, unique = true) public String receiptNumber;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "purchase_order_id") public PurchaseOrder purchaseOrder;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "received_by") public UserAccount receivedBy;
    @Column(name = "received_at", nullable = false) public Instant receivedAt;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "receiving_location_id") public StorageLocation receivingLocation;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.GoodsReceiptStatus status = DomainEnums.GoodsReceiptStatus.draft;
    @Column(name = "idempotency_key", unique = true) public UUID idempotencyKey;
    public String notes;
}

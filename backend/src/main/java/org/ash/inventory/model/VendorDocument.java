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
import java.time.LocalDate;

@Entity
@Table(name = "vendor_documents")
public class VendorDocument extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "vendor_id") public Vendor vendor;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "purchase_order_id") public PurchaseOrder purchaseOrder;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "goods_receipt_id") public GoodsReceipt goodsReceipt;
    @Enumerated(EnumType.STRING) @Column(name = "document_type", nullable = false) public DomainEnums.VendorDocumentType documentType;
    @Column(name = "original_filename", nullable = false) public String originalFilename;
    @Column(name = "mime_type", nullable = false) public String mimeType;
    @Column(name = "object_storage_key", nullable = false, unique = true) public String objectStorageKey;
    @Column(name = "file_size", nullable = false) public long fileSize;
    @Column(nullable = false, length = 128) public String checksum;
    @Column(name = "document_date") public LocalDate documentDate;
    @Column(name = "reference_number") public String referenceNumber;
    @Column(name = "total_amount_cents") public Long totalAmountCents;
    @Column(length = 3) public String currency;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "uploaded_by") public UserAccount uploadedBy;
    @Column(name = "uploaded_at", nullable = false) public Instant uploadedAt;
    @Column(name = "retention_until") public LocalDate retentionUntil;
    public String notes;
}

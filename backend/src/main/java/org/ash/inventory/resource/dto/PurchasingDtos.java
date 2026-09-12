package org.ash.inventory.resource.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class PurchasingDtos {
    private PurchasingDtos() {}

    public record VendorInput(@NotBlank String name, String contactPerson, String email, String phone,
            String address, String website, String paymentNotes, boolean preferredVendor,
            String internalNotes, Boolean active) {}
    public record VendorResponse(UUID id, String name, String contactPerson, String email, String phone,
            String address, String website, String paymentNotes, boolean preferredVendor,
            String internalNotes, boolean active) {}

    public record PurchaseOrderLineInput(@NotNull UUID itemId, @Min(1) int orderedQuantity,
            @Min(0) int unitPriceCents, String notes) {}
    public record PurchaseOrderInput(String orderNumber, @NotNull UUID vendorId, LocalDate orderDate,
            LocalDate expectedDeliveryDate, UUID eventOccurrenceId, String notes,
            @NotEmpty List<@Valid PurchaseOrderLineInput> lines) {}
    public record PurchaseOrderLineResponse(UUID id, UUID itemId, String sku, String itemName,
            int orderedQuantity, int unitPriceCents, int receivedQuantity, int remainingQuantity,
            String notes) {}
    public record PurchaseOrderResponse(UUID id, String orderNumber, UUID vendorId, String vendorName,
            LocalDate orderDate, LocalDate expectedDeliveryDate, String status, UUID eventOccurrenceId,
            UUID createdById, String notes, List<PurchaseOrderLineResponse> lines) {}
    public record PurchaseOrderTransitionInput(@NotNull org.ash.inventory.model.DomainEnums.PurchaseOrderStatus status,
            String notes) {}

    public record ReceiptLineInput(@NotNull UUID purchaseOrderLineId, @Min(0) int acceptedQuantity,
            @Min(0) int damagedQuantity, @Min(0) int rejectedQuantity, UUID lotId,
            List<String> assetCodes, String receivingNotes) {}
    public record GoodsReceiptInput(@NotNull UUID purchaseOrderId, String receiptNumber,
            @NotNull UUID receivingLocationId, Instant receivedAt, @NotNull UUID idempotencyKey,
            String notes, @NotEmpty List<@Valid ReceiptLineInput> lines) {}
    public record GoodsReceiptLineResponse(UUID id, UUID purchaseOrderLineId, UUID itemId, String itemName,
            int expectedQuantity, int acceptedQuantity, int damagedQuantity, int rejectedQuantity,
            UUID lotId, String receivingNotes) {}
    public record GoodsReceiptResponse(UUID id, String receiptNumber, UUID purchaseOrderId,
            UUID receivedById, Instant receivedAt, UUID receivingLocationId, String status,
            UUID idempotencyKey, String notes, List<GoodsReceiptLineResponse> lines) {}

    public record VendorDocumentInput(@NotNull UUID vendorId, UUID purchaseOrderId, UUID goodsReceiptId,
            @NotNull org.ash.inventory.model.DomainEnums.VendorDocumentType documentType,
            @NotBlank String originalFilename, @NotBlank String stagedObjectKey, LocalDate documentDate,
            String referenceNumber, @Min(0) Long totalAmountCents, String currency,
            LocalDate retentionUntil, String notes) {}
    public record VendorDocumentResponse(UUID id, UUID vendorId, UUID purchaseOrderId, UUID goodsReceiptId,
            String documentType, String originalFilename, String mimeType, String objectStorageKey,
            long fileSize, String checksum, LocalDate documentDate, String referenceNumber,
            Long totalAmountCents, String currency, UUID uploadedById, Instant uploadedAt,
            LocalDate retentionUntil, String notes) {}
}

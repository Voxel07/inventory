package org.ash.inventory.operations.internal.contract.dto;

import org.ash.inventory.platform.api.InputText;

import org.ash.inventory.operations.internal.model.DomainEnums;

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

    public record VendorInput(@NotBlank @InputText String name, @InputText String contactPerson, @InputText String email, @InputText String phone,
            @InputText String address, @InputText String website, @InputText String paymentNotes, boolean preferredVendor,
            @InputText String internalNotes, Boolean active) {}
    /** {@code sourceHost} is set when the item link scan generated this supplier. */
    public record VendorResponse(UUID id, String name, String contactPerson, String email, String phone,
            String address, String website, String paymentNotes, boolean preferredVendor,
            String internalNotes, boolean active, String sourceHost) {}

    /** Items found under a supplier's shop host by the last item link scan. */
    public record VendorSourceItem(UUID itemId, String sku, String itemName, String url, String currentUrl) {}
    public record VendorSourceGroup(UUID vendorId, String vendorName, String host, boolean generated, boolean active,
            List<VendorSourceItem> items) {}
    /**
     * Result of the last manual item link scan. {@code changedLinks} counts item links added, changed or removed since
     * then; they only reach the suppliers with the next scan.
     */
    public record VendorSourcesResponse(Instant lastScannedAt, String lastScannedBy, int linkedItems, int skippedItems,
            int createdVendors, long changedLinks, List<VendorSourceGroup> vendors) {}

    public record PurchaseOrderLineInput(@NotNull UUID itemId, @Min(1) int orderedQuantity,
            @Min(0) int unitPriceCents, @InputText String notes) {}
    public record PurchaseOrderInput(@InputText String orderNumber, @NotNull UUID vendorId, LocalDate orderDate,
            LocalDate expectedDeliveryDate, UUID eventOccurrenceId, @InputText String notes,
            @NotEmpty @jakarta.validation.constraints.Size(max = 2000) List<@NotNull @Valid PurchaseOrderLineInput> lines, @jakarta.validation.constraints.Size(max = 200) List<@NotNull UUID> itemRequestIds) {}
    public record PurchaseOrderLineResponse(UUID id, UUID itemId, String sku, String itemName,
            int orderedQuantity, int unitPriceCents, int receivedQuantity, int remainingQuantity,
            String notes) {}
    public record PurchaseOrderResponse(UUID id, String orderNumber, UUID vendorId, String vendorName,
            LocalDate orderDate, LocalDate expectedDeliveryDate, String status, UUID eventOccurrenceId,
            UUID createdById, String createdByName, String notes, List<PurchaseOrderLineResponse> lines) {}
    public record PurchaseOrderTransitionInput(@NotNull org.ash.inventory.operations.internal.model.DomainEnums.PurchaseOrderStatus status,
            @InputText String notes) {}

    public record ReceiptLineInput(@NotNull UUID purchaseOrderLineId, @Min(0) int acceptedQuantity,
            @Min(0) int damagedQuantity, @Min(0) int rejectedQuantity, UUID lotId, @Valid StockDtos.LotInput newLot,
            @jakarta.validation.constraints.Size(max = 1000) List<@NotBlank @InputText String> assetCodes, @InputText String receivingNotes) {}
    public record GoodsReceiptInput(@NotNull UUID purchaseOrderId, @InputText String receiptNumber,
            @NotNull UUID receivingLocationId, Instant receivedAt, @NotNull UUID idempotencyKey,
            @InputText String notes, @NotEmpty @jakarta.validation.constraints.Size(max = 2000) List<@NotNull @Valid ReceiptLineInput> lines) {}
    public record GoodsReceiptLineResponse(UUID id, UUID purchaseOrderLineId, UUID itemId, String itemName,
            int expectedQuantity, int acceptedQuantity, int damagedQuantity, int rejectedQuantity,
            UUID lotId, String receivingNotes) {}
    public record GoodsReceiptResponse(UUID id, String receiptNumber, UUID purchaseOrderId,
            UUID receivedById, Instant receivedAt, UUID receivingLocationId, String status,
            UUID idempotencyKey, String notes, List<GoodsReceiptLineResponse> lines) {}

    public record VendorDocumentInput(@NotNull UUID vendorId, UUID purchaseOrderId, UUID goodsReceiptId,
            @NotNull org.ash.inventory.operations.internal.model.DomainEnums.VendorDocumentType documentType,
            @NotBlank @InputText String originalFilename, @NotBlank @InputText(max = 1000) String stagedObjectKey, LocalDate documentDate,
            @InputText String referenceNumber, @Min(0) Long totalAmountCents, @jakarta.validation.constraints.Pattern(regexp = "[A-Za-z]{3}|") @InputText(max = 3) String currency,
            LocalDate retentionUntil, @InputText String notes) {}
    public record VendorDocumentResponse(UUID id, UUID vendorId, UUID purchaseOrderId, UUID goodsReceiptId,
            String documentType, String originalFilename, String mimeType, String objectStorageKey,
            long fileSize, String checksum, LocalDate documentDate, String referenceNumber,
            Long totalAmountCents, String currency, UUID uploadedById, Instant uploadedAt,
            LocalDate retentionUntil, String notes) {}
}

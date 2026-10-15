package org.ash.inventory.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.BatchSize;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** One requested item of a general order with its preparation, hand-over and return quantities. */
@Entity
@Table(name = "general_order_lines", uniqueConstraints =
        @UniqueConstraint(name = "uq_general_order_line_item", columnNames = {"general_order_id", "item_id"}))
public class GeneralOrderLine extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "general_order_id") public GeneralOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    /** Prepared source; checkout takes the stock from here. */
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "source_location_id") public StorageLocation sourceLocation;
    @Column(name = "line_number", nullable = false) public int lineNumber;
    @Column(name = "requested_quantity", nullable = false) public int requestedQuantity;
    @Column(name = "prepared_quantity", nullable = false) public int preparedQuantity;
    @Column(name = "handed_over_quantity", nullable = false) public int handedOverQuantity;
    @Column(name = "returned_quantity", nullable = false) public int returnedQuantity;
    @Column(name = "consumed_quantity", nullable = false) public int consumedQuantity;
    @Column(name = "damaged_quantity", nullable = false) public int damagedQuantity;
    @Column(name = "missing_quantity", nullable = false) public int missingQuantity;
    @Column(name = "written_off_quantity", nullable = false) public int writtenOffQuantity;
    @OneToMany(mappedBy = "line", cascade = CascadeType.ALL, orphanRemoval = true) @OrderBy("createdAt, id") @BatchSize(size = 64)
    public List<GeneralOrderLineAsset> assets = new ArrayList<>();

    public List<String> assetIds() { return assets.stream().map(a -> a.assetInstance.id.toString()).toList(); }
    public List<String> reconciledAssetIds() {
        return assets.stream().filter(a -> a.reconciled).map(a -> a.assetInstance.id.toString()).toList();
    }
    public GeneralOrderLineAsset asset(UUID assetId) {
        return assets.stream().filter(a -> a.assetInstance.id.equals(assetId)).findFirst().orElse(null);
    }
}

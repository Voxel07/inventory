package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "order_lines")
public class OrderLine extends BaseEntity {
    @Column(name = "line_number", nullable = false) public int lineNumber;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "source_location_id") public StorageLocation sourceLocation;
    @jakarta.persistence.OneToMany(mappedBy = "orderLine", cascade = jakarta.persistence.CascadeType.ALL, orphanRemoval = true)
    @jakarta.persistence.OrderBy("createdAt, id") @org.hibernate.annotations.BatchSize(size = 64)
    public java.util.List<OrderLineAssetAssignment> assets = new java.util.ArrayList<>();
    public java.util.List<String> assetIds() { return assets.stream().map(a -> a.assetInstance.id.toString()).toList(); }
    public java.util.List<String> reconciledAssetIds() { return assets.stream().filter(a -> a.reconciled).map(a -> a.assetInstance.id.toString()).toList(); }
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_id") public InventoryOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "source_assembly_id") public Assembly sourceAssembly;
    @Column(name = "requested_quantity", nullable = false) public int requestedQuantity;
    @Column(name = "allocated_quantity", nullable = false) public int allocatedQuantity;
    @Column(name = "reserved_quantity", nullable = false) public int reservedQuantity;
    @Column(name = "prepared_quantity", nullable = false) public int preparedQuantity;
    @Column(name = "handed_over_quantity", nullable = false) public int handedOverQuantity;
    @Column(name = "returned_quantity", nullable = false) public int returnedQuantity;
    @Column(name = "consumed_quantity", nullable = false) public int consumedQuantity;
    @Column(name = "missing_quantity", nullable = false) public int missingQuantity;
    @Column(name = "damaged_quantity", nullable = false) public int damagedQuantity;
    @Column(name = "written_off_quantity", nullable = false) public int writtenOffQuantity;
    public String notes;
}

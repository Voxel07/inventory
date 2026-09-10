package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "inventory_count_lines")
public class InventoryCountLine extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "count_session_id") public InventoryCountSession session;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "lot_id") public InventoryLot lot;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "location_id") public StorageLocation location;
    @Column(name = "expected_quantity", nullable = false) public int expectedQuantity;
    @Column(name = "counted_quantity") public Integer countedQuantity;
    @Column(name = "recounted_quantity") public Integer recountedQuantity;
    @Column(name = "approved_quantity") public Integer approvedQuantity;
    @Column(name = "variance_quantity") public Integer varianceQuantity;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "counted_by") public UserAccount countedBy;
    public String notes;
}

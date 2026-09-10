package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "inventory_transfer_lines")
public class InventoryTransferLine extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "transfer_id") public InventoryTransfer transfer;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "lot_id") public InventoryLot lot;
    @Column(name = "requested_quantity", nullable = false) public int requestedQuantity;
    @Column(name = "picked_quantity", nullable = false) public int pickedQuantity;
    @Column(name = "received_quantity", nullable = false) public int receivedQuantity;
    @Column(name = "discrepancy_quantity", nullable = false) public int discrepancyQuantity;
    @Column(name = "discrepancy_notes") public String discrepancyNotes;
}

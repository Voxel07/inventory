package org.ash.inventory.model;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "order_line_asset_assignments", uniqueConstraints =
        @UniqueConstraint(name = "uq_order_assigned_asset", columnNames = {"order_id", "asset_instance_id"}))
public class OrderLineAssetAssignment extends BaseEntity {
    @jakarta.persistence.Column(nullable = false) public boolean reconciled;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_id") public InventoryOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_line_id") public OrderLine orderLine;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
}

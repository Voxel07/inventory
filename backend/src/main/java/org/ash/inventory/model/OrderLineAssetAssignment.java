package org.ash.inventory.model;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "order_line_asset_assignments", uniqueConstraints =
        @UniqueConstraint(name = "uq_order_assigned_asset", columnNames = {"faction_order_id", "asset_instance_id"}))
public class OrderLineAssetAssignment extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "faction_order_id") public FactionOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_line_id") public FactionOrderLine orderLine;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
}

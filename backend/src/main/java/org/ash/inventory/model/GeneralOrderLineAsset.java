package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** A serialized asset prepared on a general-order line; {@code reconciled} once its return outcome is recorded. */
@Entity
@Table(name = "general_order_line_assets", uniqueConstraints =
        @UniqueConstraint(name = "uq_general_order_line_asset", columnNames = {"line_id", "asset_instance_id"}))
public class GeneralOrderLineAsset extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "line_id") public GeneralOrderLine line;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @Column(nullable = false) public boolean reconciled;
}

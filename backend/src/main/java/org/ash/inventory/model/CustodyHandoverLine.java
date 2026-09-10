package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "custody_handover_lines")
public class CustodyHandoverLine extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "handover_id") public CustodyHandover handover;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_line_id") public FactionOrderLine orderLine;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @Column(nullable = false) public int quantity;
    @Column(name = "condition_notes") public String conditionNotes;
}

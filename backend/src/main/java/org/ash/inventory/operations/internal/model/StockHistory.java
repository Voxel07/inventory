package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Observed stock totals, independent of movement quantities and backdated transactions. */
@Entity
@Table(name = "item_stock_history")
public class StockHistory extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    public Item item;
    @Column(nullable = false, insertable = false, updatable = false)
    public long sequence;
    @Column(name = "total_stock", nullable = false)
    public int total;
    @Column(name = "available_stock", nullable = false)
    public int available;
}

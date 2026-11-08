package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

/** An item that can be ordered from a supplier, found by the last item link scan. */
@Entity
@Table(name = "vendor_item_sources")
public class VendorItemSource extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "vendor_id", nullable = false)
    public Vendor vendor;
    @OneToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id", nullable = false, unique = true)
    public Item item;
    @Column(nullable = false, length = 2048)
    public String url;
}

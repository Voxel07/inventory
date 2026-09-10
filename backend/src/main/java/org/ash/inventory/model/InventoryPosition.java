package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;

import java.time.Instant;

/** Materialized quantity state for bulk or lot stock at one location. The ledger remains authoritative. */
@Entity
@Table(name = "inventory_positions", uniqueConstraints =
        @UniqueConstraint(name = "uq_position_item_location_lot", columnNames = {"item_id", "location_id", "lot_id"}))
public class InventoryPosition extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "location_id") public StorageLocation location;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "lot_id") public InventoryLot lot;
    @Column(name = "quantity_on_hand", nullable = false) public int quantityOnHand;
    @Column(name = "quantity_reserved", nullable = false) public int quantityReserved;
    @Column(name = "quantity_damaged", nullable = false) public int quantityDamaged;
    @Column(name = "quantity_quarantined", nullable = false) public int quantityQuarantined;
    @Column(name = "quantity_in_transit", nullable = false) public int quantityInTransit;
    @Column(name = "last_counted_at") public Instant lastCountedAt;
    @Version public long version;

    public int availableQuantity() {
        return Math.max(0, quantityOnHand - quantityReserved - quantityQuarantined - quantityDamaged);
    }
}

package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "faction_order_lines")
public class FactionOrderLine extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "faction_order_id") public FactionOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "source_assembly_id") public Assembly sourceAssembly;
    @Column(name = "requested_quantity", nullable = false) public int requestedQuantity;
    @Column(name = "allocated_quantity", nullable = false) public int allocatedQuantity;
    @Column(name = "reserved_quantity", nullable = false) public int reservedQuantity;
    @Column(name = "prepared_quantity", nullable = false) public int preparedQuantity;
    @Column(name = "handed_over_quantity", nullable = false) public int handedOverQuantity;
    @Column(name = "picked_up_quantity", nullable = false) public int pickedUpQuantity;
    @Column(name = "returned_quantity", nullable = false) public int returnedQuantity;
    @Column(name = "consumed_quantity", nullable = false) public int consumedQuantity;
    @Column(name = "missing_quantity", nullable = false) public int missingQuantity;
    @Column(name = "damaged_quantity", nullable = false) public int damagedQuantity;
    @Column(name = "written_off_quantity", nullable = false) public int writtenOffQuantity;
    public String notes;
}

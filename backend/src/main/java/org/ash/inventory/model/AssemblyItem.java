package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;

@Entity
@Table(name = "assembly_items")
public class AssemblyItem {
    @EmbeddedId public AssemblyItemId id;
    @MapsId("assemblyId") @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "assembly_id") public Assembly assembly;
    @MapsId("itemId") @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "item_id") public Item item;
    @Column(nullable = false) public int quantity;
}

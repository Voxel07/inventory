package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDate;

@Entity
@Table(name = "inventory_lots", uniqueConstraints =
        @UniqueConstraint(name = "uq_item_lot_number", columnNames = {"item_id", "lot_number"}))
public class InventoryLot extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @Column(name = "lot_number", nullable = false) public String lotNumber;
    @Column(name = "supplier_lot") public String supplierLot;
    @Column(name = "manufacture_date") public LocalDate manufactureDate;
    @Column(name = "expiry_date") public LocalDate expiryDate;
    @Column(name = "best_before_date") public LocalDate bestBeforeDate;
    @Column(name = "storage_requirements") public String storageRequirements;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.LotStatus status = DomainEnums.LotStatus.available;
    public String notes;
}

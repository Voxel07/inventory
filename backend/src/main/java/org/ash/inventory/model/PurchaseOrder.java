package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDate;

@Entity
@Table(name = "purchase_orders")
public class PurchaseOrder extends BaseEntity {
    @Column(name = "order_number", nullable = false, unique = true) public String orderNumber;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "vendor_id") public Vendor vendor;
    @Column(name = "order_date", nullable = false) public LocalDate orderDate;
    @Column(name = "expected_delivery_date") public LocalDate expectedDeliveryDate;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.PurchaseOrderStatus status = DomainEnums.PurchaseOrderStatus.draft;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "event_occurrence_id") public EventOccurrence eventOccurrence;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by") public UserAccount createdBy;
    public String notes;
}

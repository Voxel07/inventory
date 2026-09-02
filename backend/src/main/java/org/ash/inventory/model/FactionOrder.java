package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "faction_orders")
public class FactionOrder extends BaseEntity {
    @Column(name = "order_code", nullable = false, unique = true) public String orderCode;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "event_occurrence_id") public EventOccurrence eventOccurrence;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "faction_id") public Faction faction;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "pickup_location_id") public StorageLocation pickupLocation;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.OrderStatus status = DomainEnums.OrderStatus.draft;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by") public UserAccount createdBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "prepared_by") public UserAccount preparedBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "ready_by") public UserAccount readyBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "picked_up_by") public UserAccount pickedUpBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "returned_by") public UserAccount returnedBy;
    @Column(name = "collector_name") public String collectorName;
    public String notes;
}

package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDate;

/** Both kinds share lines and lifecycle records; kind controls request metadata and command permissions. */
@Entity
@Table(name = "orders")
public class InventoryOrder extends BaseEntity {
    public enum Kind { faction, general }
    @Enumerated(EnumType.STRING) @Column(nullable = false, updatable = false, length = 16) public Kind kind = Kind.faction;
    @Column(length = 160) public String name;
    @Column(length = 4000) public String purpose;
    @jakarta.persistence.OneToMany(mappedBy = "order", cascade = jakarta.persistence.CascadeType.ALL, orphanRemoval = true)
    @jakarta.persistence.OrderBy("lineNumber, createdAt, id") @org.hibernate.annotations.BatchSize(size = 64)
    public java.util.List<OrderLine> lines = new java.util.ArrayList<>();
    @jakarta.persistence.OneToMany(mappedBy = "order") @org.hibernate.annotations.BatchSize(size = 64)
    public java.util.List<StockReservation> reservations = new java.util.ArrayList<>();

    public java.util.Map<String, java.util.Map<String, Integer>> sourceAllocations() {
        var result = new java.util.LinkedHashMap<String, java.util.Map<String, Integer>>();
        for (var reservation : reservations) {
            if (reservation.position == null || reservation.status == DomainEnums.ReservationStatus.released) continue;
            result.computeIfAbsent(reservation.item.id.toString(), ignored -> new java.util.LinkedHashMap<>())
                    .merge(reservation.position.id.toString(), reservation.reservedQuantity, Math::addExact);
        }
        return result;
    }

    public String label() { return kind == Kind.faction ? orderCode : name; }
    public String factionLabel() { return faction == null ? "General order" : faction.name; }
    public String collectorLabel() { return collectorName == null || collectorName.isBlank() ? (kind == Kind.general ? createdBy.name : faction.name) : collectorName; }
    public java.util.Map<String, Integer> quantities(java.util.function.ToIntFunction<OrderLine> quantity) {
        var result = new java.util.LinkedHashMap<String, Integer>();
        for (var line : lines) {
            int amount = quantity.applyAsInt(line);
            if (amount != 0) result.merge(line.item.id.toString(), amount, Integer::sum);
        }
        return result;
    }
    public <T> java.util.Map<String, T> perItem(java.util.function.Function<OrderLine, T> value) {
        var result = new java.util.LinkedHashMap<String, T>();
        for (var line : lines) {
            var entry = value.apply(line);
            if (entry != null && !(entry instanceof java.util.List<?> list && list.isEmpty())) result.put(line.item.id.toString(), entry);
        }
        return result;
    }
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "pickup_assignments", columnDefinition = "jsonb", nullable = false)
    public java.util.Map<String, PickupAssignment> pickupAssignments = new java.util.LinkedHashMap<>();
    @Column(name = "order_code", unique = true) public String orderCode;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "event_occurrence_id") public EventOccurrence eventOccurrence;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "faction_id") public Faction faction;
    @Column(name = "requested_pickup_date") public LocalDate requestedPickupDate;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "pickup_location_id") public StorageLocation pickupLocation;
    @Column(name = "pickup_latitude") public Double pickupLatitude;
    @Column(name = "pickup_longitude") public Double pickupLongitude;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.OrderStatus status = DomainEnums.OrderStatus.draft;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by") public UserAccount createdBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "prepared_by") public UserAccount preparedBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "ready_by") public UserAccount readyBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "picked_up_by") public UserAccount pickedUpBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "returned_by") public UserAccount returnedBy;
    @Column(name = "collector_name") public String collectorName;
    public String notes;
}

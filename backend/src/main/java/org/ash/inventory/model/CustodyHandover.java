package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "custody_handovers")
public class CustodyHandover extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "faction_order_id") public FactionOrder order;
    @Enumerated(EnumType.STRING) @Column(name = "handover_type", nullable = false) public DomainEnums.HandoverType type;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "marshal_id") public UserAccount marshal;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "collector_id") public UserAccount collector;
    @Column(name = "collector_name", nullable = false) public String collectorName;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "location_id") public StorageLocation location;
    @Column(name = "occurred_at", nullable = false, updatable = false) public Instant occurredAt;
    @Column(name = "condition_confirmed", nullable = false) public boolean conditionConfirmed;
    @Column(name = "acknowledgement_object_key") public String acknowledgementObjectKey;
    @Column(name = "handover_code", nullable = false, unique = true) public String handoverCode;
    @Column(name = "idempotency_key", unique = true) public UUID idempotencyKey;
    public String notes;
    @PrePersist void timestamp() { if (occurredAt == null) occurredAt = Instant.now(); }
}

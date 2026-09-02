package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "faction_order_history")
public class FactionOrderHistory {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "faction_order_id") public FactionOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "actor_id") public UserAccount actor;
    @Column(nullable = false) public String action;
    @Column(name = "occurred_at", nullable = false, updatable = false) public Instant occurredAt;
    @Column(name = "from_status") public String fromStatus;
    @Column(name = "to_status") public String toStatus;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "delta_snapshot", columnDefinition = "jsonb", nullable = false) public Map<String, Object> deltaSnapshot = new LinkedHashMap<>();
    @Column(name = "idempotency_key", unique = true) public UUID idempotencyKey;
    public String notes;
    @PrePersist void prePersist() { if (occurredAt == null) occurredAt = Instant.now(); }
}

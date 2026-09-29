package org.ash.inventory.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "general_order_history")
public class GeneralOrderHistory {
    @Id @GeneratedValue public UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_id") public GeneralOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "actor_id") public UserAccount actor;
    @Column(name = "occurred_at", nullable = false, updatable = false) public Instant occurredAt = Instant.now();
    @Column(nullable = false, updatable = false) public String action;
    @Column(updatable = false, length = 4000) public String notes;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false, updatable = false) public Map<String, Object> delta;
    @Column(name = "command_id", unique = true, updatable = false) public UUID commandId;
}

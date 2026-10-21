package org.ash.inventory.notification.internal;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Entity
@Table(name = "notifications")
public class Notification extends BaseEntity {
    @Column(name = "recipient_id", nullable = false) public java.util.UUID recipientId;
    @Column(name = "order_id") public java.util.UUID orderId;
    @Column(nullable = false) public String type;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false) public Map<String, Object> payload = new LinkedHashMap<>();
    @Column(name = "read_at") public Instant readAt;
    @Column(name = "delivery_status", nullable = false) public String deliveryStatus = "pending";
    @Column(name = "delivery_attempts", nullable = false) public int deliveryAttempts;
    @Column(name = "delivered_at") public Instant deliveredAt;
    @Column(name = "last_delivery_error", length = 2000) public String lastDeliveryError;
    /** Suppresses repeated notices for the same request source; never exposed. */
    @Column(name = "dedupe_key", length = 512) public String dedupeKey;
    @Column(name="next_delivery_at") public Instant nextDeliveryAt;
    @Column(name="delivery_lease_until") public Instant deliveryLeaseUntil;
    @Column(name="delivery_lease") public java.util.UUID deliveryLease;
}

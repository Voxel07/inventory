package org.ash.inventory.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "maintenance_records")
public class MaintenanceRecord extends PanacheEntityBase {
    @Id @GeneratedValue public UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.MaintenanceType type;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "inspector_user_id") public UserAccount inspector;
    @Column(name = "performed_at", nullable = false) public Instant performedAt;
    @Column(name = "next_due_at") public Instant nextDueAt;
    @Column(name = "operating_hours") public BigDecimal operatingHours;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.MaintenanceResult result;
    @Column(name = "certificate_number") public String certificateNumber;
    public String notes;
    @Column(name = "created_at", nullable = false, updatable = false) public Instant createdAt;
    @PrePersist void prePersist() { if (createdAt == null) createdAt = Instant.now(); }
}

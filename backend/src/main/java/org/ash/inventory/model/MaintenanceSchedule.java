package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "maintenance_schedules")
public class MaintenanceSchedule extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @Enumerated(EnumType.STRING) @Column(name = "maintenance_type", nullable = false) public DomainEnums.MaintenanceType maintenanceType;
    @Enumerated(EnumType.STRING) @Column(name = "interval_type", nullable = false) public DomainEnums.MaintenanceIntervalType intervalType;
    @Column(name = "interval_value", nullable = false) public BigDecimal intervalValue;
    @Column(name = "next_due_at") public Instant nextDueAt;
    @Column(name = "next_due_value") public BigDecimal nextDueValue;
    @Column(name = "warning_window", nullable = false) public BigDecimal warningWindow = BigDecimal.ZERO;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "responsible_person_id") public UserAccount responsiblePerson;
    @Column(name = "required_checklist", length = 4000) public String requiredChecklist;
    @Column(name = "checkout_blocking", nullable = false) public boolean checkoutBlocking = true;
    @Column(nullable = false) public boolean active = true;
}

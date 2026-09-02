package org.ash.inventory.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "items")
public class Item extends BaseEntity {
    @Column(nullable = false, unique = true)
    public String sku;
    @Column(nullable = false)
    public String name;
    public String description;
    @Column(nullable = false)
    public String category;
    public String subcategory;
    public String supplier;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "event_tags", columnDefinition = "jsonb", nullable = false)
    public List<String> eventTags = new ArrayList<>();
    @Column(name = "is_consumable", nullable = false)
    public boolean consumable;
    @Column(name = "base_amount", nullable = false)
    public int baseAmount;
    @Column(name = "min_stock", nullable = false)
    public int minStock;
    @Column(name = "unit_value_cents", nullable = false)
    public int unitValueCents;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "storage_location_id")
    public StorageLocation storageLocation;
    @Column(name = "position_details")
    public String positionDetails;
    public String hint;
    @Column(name = "container_size")
    public BigDecimal containerSize;
    @Column(name = "container_count")
    public Integer containerCount;
    @Column(name = "containers_opened")
    public Integer containersOpened;
    @Column(name = "container_remaining_pct")
    public Integer containerRemainingPercent;
    @Column(name = "maintenance_interval_days")
    public Integer maintenanceIntervalDays;
    @Column(name = "next_maintenance_due")
    public LocalDate nextMaintenanceDue;
    @Column(name = "current_operating_hours", nullable = false)
    public BigDecimal currentOperatingHours = BigDecimal.ZERO;
    @Enumerated(EnumType.STRING)
    @Column(name = "maintenance_status", nullable = false)
    public DomainEnums.MaintenanceStatus maintenanceStatus = DomainEnums.MaintenanceStatus.certified;
    @Column(nullable = false)
    public boolean active = true;
}

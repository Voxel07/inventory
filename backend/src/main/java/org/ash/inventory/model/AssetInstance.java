package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One traceable physical unit of a serialized item. */
@Entity
@Table(name = "asset_instances")
public class AssetInstance extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @Column(name = "asset_code", nullable = false, unique = true) public String assetCode;
    @Column(name = "serial_number") public String serialNumber;
    public String manufacturer;
    public String model;
    @Column(name = "purchase_date") public LocalDate purchaseDate;
    @Column(name = "purchase_price_cents") public Integer purchasePriceCents;
    @Column(name = "replacement_value_cents") public Integer replacementValueCents;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "current_location_id") public StorageLocation currentLocation;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "current_custodian_id") public UserAccount currentCustodian;
    @Enumerated(EnumType.STRING) @Column(name = "condition_status", nullable = false)
    public DomainEnums.ConditionStatus conditionStatus = DomainEnums.ConditionStatus.good;
    @Enumerated(EnumType.STRING) @Column(name = "availability_status", nullable = false)
    public DomainEnums.AssetState availabilityStatus = DomainEnums.AssetState.available;
    @Enumerated(EnumType.STRING) @Column(name = "service_status", nullable = false)
    public DomainEnums.MaintenanceStatus serviceStatus = DomainEnums.MaintenanceStatus.certified;
    @Column(name = "operating_hours", nullable = false) public BigDecimal operatingHours = BigDecimal.ZERO;
    public String notes;
    @Column(nullable = false) public boolean active = true;
    @Version public long version;
}

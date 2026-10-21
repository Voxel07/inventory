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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "items")
public class Item extends BaseEntity {
    @jakarta.persistence.OneToOne(fetch = FetchType.LAZY) @JoinColumn(name = "access_policy_id", unique = true)
    public InventoryAccessPolicy accessPolicy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "responsible_person_id")
    public UserAccount responsiblePerson;
    @Column(name = "responsible_person_name", length = 255)
    public String responsiblePersonName;
    public enum Ownership { organization, private_owner, external }
    public enum AvailabilityPolicy { available, commitment_required, unavailable }
    @Enumerated(EnumType.STRING) @Column(name = "ownership_type", nullable = false)
    public Ownership ownershipType = Ownership.organization;
    @Column(name = "owner_name") public String ownerName;
    @Column(name = "keeper_name") public String keeperName;
    @Column(name = "keeper_contact") public String keeperContact;
    @Enumerated(EnumType.STRING) @Column(name = "availability_policy", nullable = false)
    public AvailabilityPolicy availabilityPolicy = AvailabilityPolicy.available;
    @Column(name = "equipment_revision", nullable = false) public long equipmentRevision;
    @Column(nullable = false, unique = true)
    public String sku;
    @Column(nullable = false)
    public String name;
    @Column(columnDefinition = "text")
    public String description;
    @Column(nullable = false)
    public String category;
    public String subcategory;
    public String supplier;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "event_tags", columnDefinition = "jsonb", nullable = false)
    public List<String> eventTags = new ArrayList<>();
    @Enumerated(EnumType.STRING)
    @Column(name = "tracking_mode", nullable = false)
    public DomainEnums.TrackingMode trackingMode = DomainEnums.TrackingMode.bulk;
    @Enumerated(EnumType.STRING)
    @Column(name = "inventory_role", nullable = false)
    public DomainEnums.InventoryRole inventoryRole = DomainEnums.InventoryRole.returnable;

    /** Consumption is a property of the inventory role, which is the only stored authority. */
    public boolean consumable() {
        return inventoryRole == DomainEnums.InventoryRole.consumable;
    }
    /**
     * Display unit of bulk quantities ("L", "m"); {@code null} counts pieces. Stock is kept in whole steps of
     * 10^-quantityDecimals units (7.5 L with one decimal is 75), so all stock arithmetic stays exact.
     */
    @Column(name = "unit")
    public String unit;
    @Column(name = "quantity_decimals", nullable = false)
    public int quantityDecimals;
    @Column(name = "min_stock", nullable = false)
    public int minStock;
    @Column(name = "unit_value_cents", nullable = false)
    public int unitValueCents;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "storage_location_id")
    public StorageLocation storageLocation;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "return_location_id")
    public StorageLocation returnLocation;
    @Column(name = "position_details")
    public String positionDetails;
    public String hint;
    @Column(name = "container_size", precision = 9, scale = 0)
    public BigDecimal containerSize;
    @Column(name = "current_operating_hours", nullable = false)
    public BigDecimal currentOperatingHours = BigDecimal.ZERO;
    /** The warehouse records the hours run (per unit, per event) when it checks a return. */
    @Column(name = "tracks_runtime", nullable = false)
    public boolean tracksRuntime;
    @Column(name = "fuel_consumption_l_100km")
    public BigDecimal fuelConsumptionLitersPer100Km;
    @Column(name = "battery_replacement_due")
    public LocalDate batteryReplacementDue;
    @Column(name = "best_before_date")
    public LocalDate bestBeforeDate;
    /** Set by a failed item-scope inspection and cleared by a passing one; the calendar status is derived. */
    @Column(name = "out_of_service", nullable = false)
    public boolean outOfService;
    @Column(nullable = false)
    public boolean active = true;
}

package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;

@Entity
@Table(name = "storage_locations")
public class StorageLocation extends BaseEntity {
    @jakarta.persistence.OneToOne(fetch = FetchType.LAZY) @JoinColumn(name = "access_policy_id", unique = true)
    public InventoryAccessPolicy accessPolicy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "keeper_user_id") public UserAccount keeperUser;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "warehouse_id") public Warehouse warehouse;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "parent_location_id") public StorageLocation parent;
    @Enumerated(EnumType.STRING) @Column(name = "location_type", nullable = false)
    public DomainEnums.LocationType locationType = DomainEnums.LocationType.bin;
    @Column(nullable = false)
    public String name;
    /** Short identifier of this level (e.g. {@code R3}); unique among its siblings. */
    @Column(nullable = false, length = 32)
    public String code;
    /** Warehouse code and all level codes from the root, e.g. {@code WH1-E1-R3-F2}; maintained by the hierarchy service. */
    @Column(name = "full_code", nullable = false, length = 400)
    public String fullCode;
    public String description;
    public Double latitude;
    public Double longitude;
    @Column(name = "map_zoom", nullable = false)
    public Integer mapZoom = 16;
    @Column(name = "map_overlay_url", length = 1000)
    public String mapOverlayUrl;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "overlay_bounds", columnDefinition = "jsonb")
    public List<List<Double>> overlayBounds;
    @Column(nullable = false) public boolean active = true;

    /** Rows created outside the hierarchy service (fixtures) still satisfy the code invariant. */
    @jakarta.persistence.PrePersist
    void defaultCodes() {
        if (code == null || code.isBlank()) code = org.ash.inventory.service.LocationHierarchyService.deriveCode(name);
        if (fullCode == null || fullCode.isBlank()) fullCode = code;
    }
}

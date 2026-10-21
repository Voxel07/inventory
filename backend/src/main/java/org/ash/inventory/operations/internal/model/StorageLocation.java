package org.ash.inventory.operations.internal.model;

import org.ash.inventory.operations.internal.application.LocationHierarchyService;
import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;

/**
 * One node of the storage tree: a top-level location (site such as {@code Betriebshof}) holds no stock;
 * its sections (depth 1) and their nested storage places (depth 2+) do.
 */
@Entity
@Table(name = "storage_locations")
public class StorageLocation extends BaseEntity {
    @jakarta.persistence.OneToOne(fetch = FetchType.LAZY) @JoinColumn(name = "access_policy_id", unique = true)
    public InventoryAccessPolicy accessPolicy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "keeper_user_id") public UserAccount keeperUser;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "parent_location_id") public StorageLocation parent;
    @Column(nullable = false)
    public String name;
    /** Short identifier of this level (e.g. {@code R3}); unique among its siblings. */
    @Column(nullable = false, length = 32)
    public String code;
    /** All level codes from the top-level location, e.g. {@code BH-CE-R2-F7}; maintained by the hierarchy service. */
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

    /** Top-level locations only group sections; stock is kept in sections and storage places. */
    public boolean holdsStock() { return parent != null; }

    /** 0 = location, 1 = section, 2+ = storage place. */
    public int depth() {
        int depth = 0;
        var seen = new java.util.HashSet<java.util.UUID>();
        for (var cursor = parent; cursor != null && (cursor.id == null || seen.add(cursor.id)); cursor = cursor.parent) depth++;
        return depth;
    }

    public StorageLocation root() {
        var root = this;
        var seen = new java.util.HashSet<java.util.UUID>();
        while (root.parent != null && (root.parent.id == null || seen.add(root.parent.id))) root = root.parent;
        return root;
    }

    /** Rows created outside the hierarchy service (fixtures) still satisfy the code invariant. */
    @jakarta.persistence.PrePersist
    void defaultCodes() {
        if (code == null || code.isBlank()) code = org.ash.inventory.operations.internal.application.LocationHierarchyService.deriveCode(name);
        if (fullCode == null || fullCode.isBlank()) fullCode = code;
    }
}

package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;

@Entity
@Table(name = "storage_locations")
public class StorageLocation extends BaseEntity {
    @Column(nullable = false)
    public String name;
    public String description;
    public String area;
    public String location;
    public String position;
    public Double latitude;
    public Double longitude;
    @Column(name = "map_zoom", nullable = false)
    public Integer mapZoom = 16;
    @Column(name = "map_overlay_url", length = 1000)
    public String mapOverlayUrl;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "overlay_bounds", columnDefinition = "jsonb")
    public List<List<Double>> overlayBounds;
}

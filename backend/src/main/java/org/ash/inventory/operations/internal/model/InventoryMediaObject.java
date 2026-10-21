package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity @Table(name = "inventory_media_objects")
public class InventoryMediaObject extends BaseEntity {
    @Column(name = "object_key", nullable = false, unique = true, length = 1024) public String objectKey;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "uploader_id", nullable = false) public UserAccount uploader;
    @Column(name = "purge_lease") public UUID purgeLease;
    @Column(name = "purge_lease_until") public java.time.Instant purgeLeaseUntil;
    @Column(name = "resource_type") public String resourceType;
    @Column(name = "resource_id") public UUID resourceId;
}

package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Replaceable QR/barcode aliases; history is preserved by retiring rather than deleting codes. */
@Entity
@Table(name = "inventory_codes")
public class InventoryCode extends BaseEntity {
    @Column(nullable = false, unique = true) public String code;
    @Enumerated(EnumType.STRING) @Column(name = "target_type", nullable = false) public DomainEnums.CodeTargetType targetType;
    @Column(name = "target_id", nullable = false) public UUID targetId;
    @Column(name = "is_primary", nullable = false) public boolean primaryCode;
    @Column(name = "active", nullable = false) public boolean active = true;
    @Column(name = "retired_at") public Instant retiredAt;
}

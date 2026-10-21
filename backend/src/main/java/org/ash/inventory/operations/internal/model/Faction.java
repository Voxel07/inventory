package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "factions", uniqueConstraints = @jakarta.persistence.UniqueConstraint(name = "uq_faction_event_slug", columnNames = {"event_type", "slug"}))
public class Faction extends BaseEntity {
    @Column(name = "event_type", nullable = false) public String eventType;
    @Column(nullable = false) public String name;
    @Column(nullable = false) public String slug;
    @Column(name = "is_active", nullable = false) public boolean active = true;
}

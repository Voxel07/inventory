package org.ash.inventory.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "factions")
public class Faction extends BaseEntity {
    @Column(name = "event_type", nullable = false) public String eventType;
    @Column(nullable = false) public String name;
    @Column(nullable = false) public String slug;
    @Column(name = "is_active", nullable = false) public boolean active = true;
}

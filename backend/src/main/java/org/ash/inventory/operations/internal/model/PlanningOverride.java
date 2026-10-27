package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.*;

@Entity
@Table(name = "planning_overrides")
public class PlanningOverride extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "event_id") public EventOccurrence event;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "actor_id") public UserAccount actor;
    @Column(nullable = false) public int quantity;
    @Column(nullable = false, length = 2000) public String reason;
}

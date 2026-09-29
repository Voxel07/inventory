package org.ash.inventory.model;

import jakarta.persistence.*;

@Entity
@Table(name = "planning_overrides")
public class PlanningOverride extends BaseEntity {
    @ManyToOne(optional = false) @JoinColumn(name = "event_id") public EventOccurrence event;
    @ManyToOne(optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(optional = false) @JoinColumn(name = "actor_id") public UserAccount actor;
    @Column(nullable = false) public int quantity;
    @Column(nullable = false, length = 2000) public String reason;
}

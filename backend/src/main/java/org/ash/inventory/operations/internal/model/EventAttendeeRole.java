package org.ash.inventory.operations.internal.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.util.Set;
import java.util.UUID;

@Embeddable
public class EventAttendeeRole {
    public static final Set<String> FACTION_ROLES = Set.of("faction_leader", "faction_deputy", "faction_hq_crew");

    @Column(nullable = false) public String role;
    @Column(name = "faction_id") public UUID factionId;
    /** Work assigned to event crew. */
    public String assignment;

    public EventAttendeeRole() {}

    public EventAttendeeRole(String role, UUID factionId, String assignment) {
        this.role = role;
        this.factionId = factionId;
        this.assignment = assignment;
    }
}

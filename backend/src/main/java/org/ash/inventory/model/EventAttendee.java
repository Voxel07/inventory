package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "event_attendees")
public class EventAttendee extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false) public EventOccurrence event;
    @Column(nullable = false) public String name;
    @Column(nullable = false) public String role;
    @Column(name = "arrives_at") public LocalDateTime arrivesAt;
    @Column(name = "leaves_at") public LocalDateTime leavesAt;
    @Column(name = "food_stamps_issued", nullable = false) public boolean foodStampsIssued;
    @Column(length = 2000) public String notes;
}

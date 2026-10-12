package org.ash.inventory.model;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "event_attendees")
public class EventAttendee extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false) public EventOccurrence event;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "person_id", nullable = false) public EventPerson person;
    @Column(name = "arrives_at") public LocalDateTime arrivesAt;
    @Column(name = "leaves_at") public LocalDateTime leavesAt;
    @Column(name = "food_stamps_issued", nullable = false) public boolean foodStampsIssued;
    @Column(length = 2000) public String notes;
    @ElementCollection
    @CollectionTable(name = "event_attendee_roles", joinColumns = @JoinColumn(name = "attendee_id"))
    public List<EventAttendeeRole> roles = new ArrayList<>();
}

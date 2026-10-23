package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "event_timeline_entries")
public class EventTimelineEntry extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false) public EventOccurrence event;
    @Column(nullable = false) public String category;
    @Column(nullable = false) public String title;
    @Column(name = "starts_at", nullable = false) public Instant startsAt;
    @Column(name = "ends_at") public Instant endsAt;
    public String owner;
    public String location;
    @Column(nullable = false) public String status = "planned";
    @Column(length = 2000) public String description;
}

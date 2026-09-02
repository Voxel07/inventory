package org.ash.inventory.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.LocalDate;

@Entity
@Table(name = "event_occurrences")
public class EventOccurrence extends BaseEntity {
    @Column(name = "event_type", nullable = false) public String eventType;
    @Column(nullable = false) public String name;
    @Column(name = "start_date", nullable = false) public LocalDate startDate;
    @Column(name = "end_date", nullable = false) public LocalDate endDate;
    @Column(nullable = false) public String status = "planned";
    public String notes;
}

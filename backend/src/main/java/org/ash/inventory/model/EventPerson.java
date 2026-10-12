package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Someone who attends events; shared across events so a rename applies everywhere. */
@Entity
@Table(name = "event_people")
public class EventPerson extends BaseEntity {
    @Column(nullable = false) public String name;
    /** Optional Authentik account; event crew usually has none. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", unique = true) public UserAccount user;
}

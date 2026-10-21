package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name = "action_reminders", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "action_key"}))
public class ActionReminder extends BaseEntity {
    @ManyToOne(optional = false) @JoinColumn(name = "user_id") public UserAccount user;
    @Column(name = "action_key", nullable = false) public String actionKey;
    @Column(name = "remind_at") public Instant remindAt;
}

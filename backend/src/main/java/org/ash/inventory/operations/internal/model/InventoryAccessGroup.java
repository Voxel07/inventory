package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.*;
import java.util.*;

/**
 * Share groups are owned by a user (e.g. a tenant sharing their building) or, with no owner, managed
 * by the inventory admin. They are never inferred from role/faction strings.
 */
@Entity @Table(name = "inventory_access_groups")
public class InventoryAccessGroup extends BaseEntity {
    @Column(nullable = false) public String name;
    @Column(nullable = false) public long revision;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "owner_user_id") public UserAccount owner;
    @ManyToMany @JoinTable(name = "inventory_access_group_members",
            joinColumns = @JoinColumn(name = "group_id"), inverseJoinColumns = @JoinColumn(name = "user_id"))
    public Set<UserAccount> members = new HashSet<>();
}

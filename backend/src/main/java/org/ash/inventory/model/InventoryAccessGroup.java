package org.ash.inventory.model;

import jakarta.persistence.*;
import java.util.*;

/** Share groups are administered by HQ, never inferred from role/faction strings. */
@Entity @Table(name = "inventory_access_groups")
public class InventoryAccessGroup extends BaseEntity {
    @Column(nullable = false, unique = true) public String name;
    @Column(nullable = false) public long revision;
    @ManyToMany @JoinTable(name = "inventory_access_group_members",
            joinColumns = @JoinColumn(name = "group_id"), inverseJoinColumns = @JoinColumn(name = "user_id"))
    public Set<UserAccount> members = new HashSet<>();
}

package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** A logical stock-owning site. Physical bins remain storage locations. */
@Entity
@Table(name = "warehouses")
public class Warehouse extends BaseEntity {
    @Column(nullable = false, unique = true) public String code;
    @Column(nullable = false) public String name;
    public String description;
    @Column(nullable = false) public boolean active = true;
}

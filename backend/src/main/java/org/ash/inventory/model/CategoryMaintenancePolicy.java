package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "category_maintenance_policies")
public class CategoryMaintenancePolicy extends BaseEntity {
    @Column(nullable = false, unique = true)
    public String category;
    @Column(name = "interval_days", nullable = false)
    public int intervalDays;
}

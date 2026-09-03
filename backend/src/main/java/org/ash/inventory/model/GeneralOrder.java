package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "general_orders")
public class GeneralOrder extends BaseEntity {
    @Column(nullable = false, length = 160) public String name;
    @Column(nullable = false, length = 4000) public String purpose;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by") public UserAccount createdBy;
}

package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "vendors")
public class Vendor extends BaseEntity {
    @Column(nullable = false, unique = true) public String name;
    @Column(name = "contact_person") public String contactPerson;
    public String email;
    public String phone;
    public String address;
    public String website;
    @Column(name = "payment_notes") public String paymentNotes;
    @Column(name = "preferred_vendor", nullable = false) public boolean preferredVendor;
    @Column(name = "internal_notes") public String internalNotes;
    @Column(nullable = false) public boolean active = true;
}

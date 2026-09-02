package org.ash.inventory.domain;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "item_images")
public class ItemImage extends PanacheEntityBase {
    @Id @GeneratedValue public UUID id;
    @ManyToOne(optional = false) @JoinColumn(name = "item_id") public Item item;
    @Column(name = "object_key", nullable = false, length = 1000) public String objectKey;
    @Column(name = "display_order", nullable = false) public int displayOrder;
    @Column(name = "created_at", nullable = false, updatable = false) public Instant createdAt;
    @PrePersist void prePersist() { if (createdAt == null) createdAt = Instant.now(); }
}

package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "inventory_count_sessions")
public class InventoryCountSession extends BaseEntity {
    @Column(name = "session_number", nullable = false, unique = true) public String sessionNumber;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "warehouse_id") public Warehouse warehouse;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "location_id") public StorageLocation location;
    public String category;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "item_id") public Item item;
    @Column(name = "blind_count", nullable = false) public boolean blindCount;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.CountStatus status = DomainEnums.CountStatus.draft;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by") public UserAccount createdBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "approved_by") public UserAccount approvedBy;
    @Column(name = "started_at") public Instant startedAt;
    @Column(name = "completed_at") public Instant completedAt;
    @Column(name = "approved_at") public Instant approvedAt;
    public String notes;
}

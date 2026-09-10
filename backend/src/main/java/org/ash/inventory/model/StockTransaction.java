package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "stock_transactions")
public class StockTransaction extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id") public UserAccount user;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.TransactionType type;
    @Column(nullable = false) public int quantity;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "faction_order_id") public FactionOrder factionOrder;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "damage_report_id") public DamageReport damageReport;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "source_location_id") public StorageLocation sourceLocation;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "destination_location_id") public StorageLocation destinationLocation;
    @Column(name = "related_entity_type") public String relatedEntityType;
    @Column(name = "related_entity_id") public UUID relatedEntityId;
    @Column(name = "availability_before") public Integer availabilityBefore;
    @Column(name = "availability_after") public Integer availabilityAfter;
    public String reason;
    public String notes;
    @Column(name = "occurred_at", nullable = false, updatable = false) public Instant occurredAt;
    @Column(name = "idempotency_key", unique = true) public UUID idempotencyKey;
    @Column(name = "client_command_id") public UUID clientCommandId;
    @PrePersist void transactionTimestamp() { if (occurredAt == null) occurredAt = Instant.now(); }
}

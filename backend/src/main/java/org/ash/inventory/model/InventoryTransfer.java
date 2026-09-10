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
import java.util.UUID;

@Entity
@Table(name = "inventory_transfers")
public class InventoryTransfer extends BaseEntity {
    @Column(name = "transfer_number", nullable = false, unique = true) public String transferNumber;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "source_location_id") public StorageLocation sourceLocation;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "destination_location_id") public StorageLocation destinationLocation;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.TransferStatus status = DomainEnums.TransferStatus.requested;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "requested_by") public UserAccount requestedBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "received_by") public UserAccount receivedBy;
    @Column(name = "dispatched_at") public Instant dispatchedAt;
    @Column(name = "received_at") public Instant receivedAt;
    @Column(name = "idempotency_key", unique = true) public UUID idempotencyKey;
    public String notes;
}

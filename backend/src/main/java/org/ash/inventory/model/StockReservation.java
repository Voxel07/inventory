package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;
import jakarta.persistence.Index;

import java.time.Instant;

@Entity
@Table(name = "stock_reservations", uniqueConstraints =
        @UniqueConstraint(name = "uq_active_asset_reservation", columnNames = {"asset_instance_id", "active_asset_key"}),
        indexes = {
                @Index(name = "ix_reservation_item_status", columnList = "item_id,status"),
                @Index(name = "ix_reservation_order", columnList = "faction_order_id")
        })
public class StockReservation extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "faction_order_id") public FactionOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_line_id") public FactionOrderLine orderLine;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "location_id") public StorageLocation location;
    @Column(name = "requested_quantity", nullable = false) public int requestedQuantity;
    @Column(name = "reserved_quantity", nullable = false) public int reservedQuantity;
    @Column(name = "released_quantity", nullable = false) public int releasedQuantity;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.ReservationStatus status = DomainEnums.ReservationStatus.active;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by") public UserAccount createdBy;
    @Column(name = "released_at") public Instant releasedAt;
    @Column(name = "active_asset_key") public String activeAssetKey = "ACTIVE";
    @Version public long version;

    public int openQuantity() { return Math.max(0, reservedQuantity - releasedQuantity); }
}

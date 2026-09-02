package org.ash.inventory.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "damage_reports")
public class DamageReport extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "reporter_id") public UserAccount reporter;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "handler_id") public UserAccount handler;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "faction_order_id") public FactionOrder factionOrder;
    @Column(nullable = false) public int quantity;
    @Column(name = "repaired_quantity", nullable = false) public int repairedQuantity;
    @Column(name = "written_off_quantity", nullable = false) public int writtenOffQuantity;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.DamageSeverity severity;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.DamageStatus status = DomainEnums.DamageStatus.reported;
    @Column(nullable = false) public String description;
    @Column(name = "resolution_notes") public String resolutionNotes;
    @Column(name = "idempotency_key", unique = true) public java.util.UUID idempotencyKey;
}

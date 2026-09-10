package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "return_reconciliations")
public class ReturnReconciliation extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "faction_order_id") public FactionOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_line_id") public FactionOrderLine orderLine;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.ReconciliationOutcome outcome;
    @Column(nullable = false) public int quantity;
    @Enumerated(EnumType.STRING) @Column(name = "condition_before") public DomainEnums.ConditionStatus conditionBefore;
    @Enumerated(EnumType.STRING) @Column(name = "condition_after") public DomainEnums.ConditionStatus conditionAfter;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "recorded_by") public UserAccount recordedBy;
    @Column(name = "idempotency_key") public UUID idempotencyKey;
    public String notes;
}

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
@Table(name = "repair_cases")
public class RepairCase extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "damage_report_id") public DamageReport damageReport;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "handover_id") public CustodyHandover handover;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.RepairStatus status = DomainEnums.RepairStatus.reported;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "repair_owner_id") public UserAccount repairOwner;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "repair_vendor_id") public Vendor repairVendor;
    @Column(name = "safety_impact", nullable = false) public boolean safetyImpact;
    @Column(name = "parts_and_cost_notes") public String partsAndCostNotes;
    @Column(name = "started_at") public Instant startedAt;
    @Column(name = "completed_at") public Instant completedAt;
    @Column(name = "verification_result") public String verificationResult;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "approved_by") public UserAccount approvedBy;
    public String notes;
}

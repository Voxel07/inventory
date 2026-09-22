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

/** A physical return awaiting warehouse inspection before stock is changed. */
@Entity
@Table(name = "return_submissions")
public class ReturnSubmission extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    public Item item;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_instance_id")
    public AssetInstance assetInstance;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_asset_state")
    public DomainEnums.AssetState previousAssetState;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "faction_order_id")
    public FactionOrder factionOrder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "returned_for_user_id")
    public UserAccount returnedFor;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "submitted_by_id")
    public UserAccount submittedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expected_return_location_id")
    public StorageLocation expectedReturnLocation;

    @Column(nullable = false)
    public int quantity;

    @Column(name = "placement_image_object_key")
    public String placementImageObjectKey;

    public String notes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    public DomainEnums.ReturnSubmissionStatus status = DomainEnums.ReturnSubmissionStatus.pending;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "acknowledged_by_id")
    public UserAccount acknowledgedBy;

    @Column(name = "acknowledged_at")
    public Instant acknowledgedAt;

    @Column(name = "acknowledgement_notes")
    public String acknowledgementNotes;
}

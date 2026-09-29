package org.ash.inventory.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** An explicit offer of one homogeneous owner's stock pool. Kept after cancellation. */
@Entity
@Table(name = "equipment_commitments")
public class EquipmentCommitment extends BaseEntity {
    @ManyToOne(optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne @JoinColumn(name = "event_id") public EventOccurrence event;
    @Column(nullable = false) public int quantity;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "asset_ids", columnDefinition = "jsonb", nullable = false)
    public List<String> assetIds = new ArrayList<>();
    @Column(name = "available_from", nullable = false) public LocalDate availableFrom;
    @Column(name = "available_until", nullable = false) public LocalDate availableUntil;
    @Column(name = "pickup_details", nullable = false) public String pickupDetails;
    @Column(name = "return_due") public LocalDate returnDue;
    @Column(name = "return_details") public String returnDetails;
    @Column(nullable = false) public String notes;
    @Column(nullable = false) public boolean cancelled;
    @Column(name = "cancellation_reason") public String cancellationReason;
    @ManyToOne(optional = false) @JoinColumn(name = "recorded_by") public UserAccount recordedBy;
}

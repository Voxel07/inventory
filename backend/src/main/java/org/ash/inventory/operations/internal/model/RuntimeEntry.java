package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One booking of running hours: which unit (or, for bulk items, which item) ran how long, and at which event.
 * The asset's {@code operatingHours} is the meter reading after the latest entry.
 */
@Entity
@Table(name = "runtime_entries")
public class RuntimeEntry extends BaseEntity {
    public enum Source { manual, return_check, maintenance, correction }

    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "item_id") public Item item;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "asset_instance_id") public AssetInstance assetInstance;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "event_occurrence_id") public EventOccurrence eventOccurrence;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "order_id") public InventoryOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "recorded_by_id") public UserAccount recordedBy;
    /** Hours run in this booking; negative only for corrections of a mistyped reading. */
    @Column(nullable = false, precision = 12, scale = 2) public BigDecimal hours;
    @Column(name = "reading_after", nullable = false, precision = 12, scale = 2) public BigDecimal readingAfter;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public Source source = Source.manual;
    @Column(name = "recorded_at", nullable = false) public Instant recordedAt;
    public String notes;
}

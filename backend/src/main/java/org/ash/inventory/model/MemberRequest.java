package org.ash.inventory.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Contributor evidence; inventory is changed only by the warehouse acknowledgement workflow. */
@Entity @Table(name = "member_requests")
public class MemberRequest extends BaseEntity {
    @ManyToOne(optional = false) public UserAccount requester;
    @ManyToOne(optional = false) public Item item;
    @ManyToOne public AssetInstance asset;
    @ManyToOne public StorageLocation location;
    /** Damage to a serialized asset is recorded as a real damage report; this request carries the coordination. */
    @OneToOne @JoinColumn(name = "damage_report_id") public DamageReport damageReport;
    @Column(nullable = false) public String kind;
    @Column(nullable = false) public int quantity;
    @Column(nullable = false, length = 2000) public String notes;
    @Column(nullable = false) public String status = "open";
    @Column(length = 2000) public String response;
    @ManyToOne @JoinColumn(name = "handled_by_id") public UserAccount handledBy;
    @Column(name = "handled_at") public Instant handledAt;
    @Column(name = "command_id", nullable = false, unique = true) public UUID commandId;
    @Version public long revision;
}

package org.ash.inventory.model;

import jakarta.persistence.*;

@Entity @Table(name="handover_evidence")
public class HandoverEvidence extends BaseEntity {
    @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="handover_id") public CustodyHandover handover;
    @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="recorded_by_id") public UserAccount recordedBy;
    @Column(name="condition_confirmed", nullable=false) public boolean conditionConfirmed;
    @Column(name="condition_notes", nullable=false, length=2000) public String conditionNotes;
    @Column(name="acknowledgement_object_key") public String acknowledgementObjectKey;
    @Column(name="command_id", nullable=false, unique=true) public java.util.UUID commandId;
    @Column(name="input_hash",nullable=false,length=64) public String inputHash;
}

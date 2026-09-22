package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;

@Entity
@Table(name = "general_orders")
public class GeneralOrder extends BaseEntity {
    @Column(nullable = false, length = 160) public String name;
    @Column(nullable = false, length = 4000) public String purpose;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by") public UserAccount createdBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "event_occurrence_id") public EventOccurrence eventOccurrence;
    @Column(nullable = false) public String status = "draft";
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "requested_quantities", columnDefinition = "jsonb") public Map<String, Integer> requestedQuantities = new LinkedHashMap<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "handed_over_quantities", columnDefinition = "jsonb") public Map<String, Integer> handedOverQuantities = new LinkedHashMap<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "returned_quantities", columnDefinition = "jsonb") public Map<String, Integer> returnedQuantities = new LinkedHashMap<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "consumed_quantities", columnDefinition = "jsonb") public Map<String, Integer> consumedQuantities = new LinkedHashMap<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "asset_assignments", columnDefinition = "jsonb") public Map<String, List<String>> assetAssignments = new LinkedHashMap<>();
}

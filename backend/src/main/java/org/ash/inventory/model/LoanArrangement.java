package org.ash.inventory.model;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.*;

@Entity @Table(name = "loan_arrangements")
public class LoanArrangement extends BaseEntity {
    @OneToOne(optional = false) @JoinColumn(name = "commitment_id", unique = true) public EquipmentCommitment commitment;
    @ManyToOne(optional = false) @JoinColumn(name = "provider_location_id") public StorageLocation providerLocation;
    @Column(nullable = false) public String kind;
    @Column(nullable = false) public String provider;
    @Column(nullable = false) public String contact;
    @Column(nullable = false, length = 2000) public String terms;
    @Column(nullable = false) public int collected;
    @Column(nullable = false) public int returned;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "collected_assets", columnDefinition = "jsonb", nullable = false) public List<String> collectedAssets = new ArrayList<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "returned_assets", columnDefinition = "jsonb", nullable = false) public List<String> returnedAssets = new ArrayList<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "transfer_ids", columnDefinition = "jsonb", nullable = false) public List<String> transferIds = new ArrayList<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false) public List<Map<String, String>> history = new ArrayList<>();
    @Version public long revision;
}

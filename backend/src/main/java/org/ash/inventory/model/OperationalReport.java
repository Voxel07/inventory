package org.ash.inventory.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.*;

/** Disposable query projection. No inventory command reads this table. */
@Entity @Table(name = "operational_reports")
public class OperationalReport {
    @Id public String name;
    @Version public long version;
    @Column(name = "started_at") public Instant startedAt;
    @Column(name = "generated_at") public Instant generatedAt;
    @Column(name = "source_token", length = 8000) public String sourceToken;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "report_rows", columnDefinition = "jsonb", nullable = false)
    public List<Map<String, Object>> rows = new ArrayList<>();
}

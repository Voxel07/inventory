package org.ash.inventory.reporting.api;

import java.time.Instant;
import java.util.*;
/** Operational owners provide value snapshots. Reporting never imports their entities or schema. */
public interface ReportSource {
    record Snapshot(String sourceToken,Instant startedAt,Instant generatedAt,List<Map<String,Object>> rows) {
        public Snapshot { rows=rows.stream().map(row -> Collections.unmodifiableMap(new LinkedHashMap<>(row))).toList(); }
    }
    String token(String name);
    Snapshot build(String name);
}

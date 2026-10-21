package org.ash.inventory.reporting.api;

import java.util.*;
/** Owner decisions are evaluated at read time, including export and totals. Indices are zero based. */
public interface ReportPolicy {
    void requireRead(UUID actorId);
    Set<Integer> allowed(UUID actorId,List<Map<String,Object>> candidates);
}

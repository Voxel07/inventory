package org.ash.inventory.operations.internal.persistence;

import java.util.*;
/** Explicit report dependencies drive both invalidation and source-work budgets. */
public final class ReportSources {
    private ReportSources() {}
    public static final Map<String,Set<String>> TABLES=Map.ofEntries(
        Map.entry("events",Set.of("items","event_occurrences","orders","order_lines","stock_transactions")),
        Map.entry("availability",Set.of("items","storage_locations","asset_instances","inventory_positions","inventory_lots","stock_transactions","stock_reservations","damage_reports","maintenance_schedules","equipment_commitments","loan_arrangements","member_requests")),
        Map.entry("returns",Set.of("items","storage_locations","orders","order_lines","order_line_asset_assignments","stock_transactions","return_submissions","event_occurrences","app_users")),
        Map.entry("repairs",Set.of("assemblies","items","storage_locations","asset_instances","repair_cases","damage_reports","vendors","app_users")),
        Map.entry("maintenance",Set.of("items","storage_locations","asset_instances","maintenance_schedules","stock_transactions","app_users")),
        Map.entry("purchases",Set.of("items","vendors","purchase_orders","purchase_order_lines","event_occurrences")),
        Map.entry("counts",Set.of("items","storage_locations","inventory_count_sessions","inventory_count_lines")),
        Map.entry("movements",Set.of("items","storage_locations","stock_transactions","app_users","event_occurrences")));
}

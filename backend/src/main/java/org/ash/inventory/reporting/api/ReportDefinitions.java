package org.ash.inventory.reporting.api;

import java.util.*;
public final class ReportDefinitions {
    private ReportDefinitions() {}
    private static final Map<String, String> DEFINITIONS = new LinkedHashMap<>();
    static {
        DEFINITIONS.put("events", "One row per event/item, including planned-only items. Planned is total forecast; requested is active order demand. Handed over is historical deployment and survives returns. Outstanding = handed over minus good/damaged returns, consumption and write-offs. Missing remains outstanding. Date filter uses event start date.");
        DEFINITIONS.put("availability", "Current bulk/lot positions and individual serialized assets by actual location. Available is unrestricted organization stock; private/external or commitment-required stock needs event-specific planning and is zero here. Ownership is separate from physical on-hand. Available excludes reservations, damage, quarantine, unusable lots, blocked maintenance and items held by an open contributor damage report. Transit and custody (including pending checks) are separate from on-hand. Unlocated legacy quantities are shown as unassigned with zero location availability until reconciled. Inactive locations remain traceable. Date is snapshot date, not historical stock.");
        DEFINITIONS.put("returns", "Unresolved custody by item/person/order/asset. Pending acknowledgement is a subset of outstanding, never subtracted twice. Missing is still outstanding. Date is event end date where attributable; otherwise unknown. This is an unresolved worklist, not historical custody at a selected date.");
        DEFINITIONS.put("repairs", "Open repair cases, excluding returned-to-service and written-off cases, plus unresolved damage incidents not yet assigned a repair case. Repaired and verified cases remain in backlog until release. Quantity is the originating damage quantity for cases and unresolved quantity for incidents. Date is case/incident creation date.");
        DEFINITIONS.put("maintenance", "Active schedules with unknown/due/warning/healthy status at generation. Calendar warning windows are days; meter windows use hours or checkout count. Missing meter evidence is unknown, not zero. Date is next calendar due date; meter schedules have no calendar date.");
        DEFINITIONS.put("purchases", "One row per supplier purchase line, including drafts and cancelled orders. Ordered is recorded line quantity; received is delivered quantity. Open delivery excludes draft/cancelled/closed purchases. Value cents = ordered quantity × unit price cents, not paid cost. Filter status before comparing committed spend. Date is order date.");
        DEFINITIONS.put("counts", "Completed counts only (posted/cancelled), so reports cannot reveal expected quantities during a blind count. Original count, recount, approved count and signed variance are retained separately. Date is completion date, or last update for cancelled sessions. Only posted variances changed stock.");
        DEFINITIONS.put("movements", "Immutable consumed and written-off transactions, one row per ledger record. Quantities are positive outcome amounts; they are not summed with event summaries. Unassigned historical events are not guessed. Date is the transaction occurrence date in the business time zone. Group by month and type for trends.");
    }
    public static Map<String,String> all() { return Collections.unmodifiableMap(DEFINITIONS); }
}

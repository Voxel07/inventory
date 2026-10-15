package org.ash.inventory.service;

import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.Item;
import org.ash.inventory.resource.ApiException;

/**
 * Return reconciliation rules shared by faction and general orders. Both aggregates validate one outcome per item
 * against the quantity still outstanding on the order; they differ only in how they record the accepted result
 * (reservations and handovers for faction orders, line counters for general orders).
 */
final class OrderReturnPolicy {
    /** Damage found while reconciling a return is recorded at this severity until the warehouse triages it. */
    static final DomainEnums.DamageSeverity RETURN_DAMAGE_SEVERITY = DomainEnums.DamageSeverity.high;

    private OrderReturnPolicy() {}

    /** One item's return outcome; {@code missing} is the quantity reported missing by this command. */
    record Outcome(int returned, int consumed, int damaged, int writtenOff, int missing, String writeOffReason) {
        int reconciled() { return returned + consumed + damaged + writtenOff; }
    }

    /** Consumption needs a consumable item, write-offs need an admin and a reason, and nothing exceeds the outstanding quantity. */
    static void validate(Item item, Outcome outcome, int outstanding, ActorService actors) {
        if (outcome.consumed() > 0 && !item.consumable())
            throw ApiException.badRequest("Only consumable items can be recorded as consumed");
        if (outcome.writtenOff() > 0) {
            actors.requireAdmin();
            if (outcome.writeOffReason() == null || outcome.writeOffReason().isBlank())
                throw ApiException.badRequest("Write-off reason is required for " + item.name);
        }
        if (outcome.reconciled() + outcome.missing() > outstanding)
            throw ApiException.badRequest("Return quantities exceed outstanding quantity for " + item.name);
    }

    static String damageDescription(String notes, String orderLabel) {
        return notes == null || notes.isBlank() ? "Damage recorded during the return of " + orderLabel : notes;
    }
}

package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

/**
 * Return reconciliation rules for both kinds of the order aggregate. One outcome per item is checked against
 * the quantity still outstanding before the shared workflow records line counters, handovers and reconciliations.
 */
final class OrderReturnPolicy {
    /** Damage found while reconciling a return is recorded at this severity until the warehouse triages it. */
    static final DomainEnums.DamageSeverity RETURN_DAMAGE_SEVERITY = DomainEnums.DamageSeverity.high;

    private OrderReturnPolicy() {}

    /** One item's return outcome; {@code missing} is the unresolved total after this command. */
    record Outcome(int returned, int damaged, int writtenOff, int missing, String writeOffReason) {
        int reconciled() { return returned + damaged + writtenOff; }
    }

    /** Consumables are consumed at pickup, write-offs need an admin and a reason, and nothing exceeds the outstanding quantity. */
    static void validate(Item item, Outcome outcome, int outstanding, ActorService actors) {
        if (item.consumable())
            throw ApiException.badRequest(item.name + " is a consumable: it was consumed at pickup and is not returned");
        if (outcome.writtenOff() > 0) {
            actors.requireAdmin();
            if (outcome.writeOffReason() == null || outcome.writeOffReason().isBlank())
                throw ApiException.badRequest("Write-off reason is required for " + item.name);
        }
        if (outcome.reconciled() + outcome.missing() > outstanding)
            throw ApiException.badRequest("Return quantities exceed outstanding quantity for " + item.name);
    }

    /**
     * A runtime-tracked unit going back to stock needs the meter reading after the event, and a reading never goes
     * below the current meter; editing the meter is a separate correction.
     */
    static void validateReading(Item item, java.math.BigDecimal reading, java.math.BigDecimal current, boolean backInStock, String unit) {
        if (reading == null) {
            if (item.tracksRuntime && backInStock) throw ApiException.badRequest("Record the hours run before returning " + unit + " to stock");
            return;
        }
        var meter = current == null ? java.math.BigDecimal.ZERO : current;
        if (reading.compareTo(meter) < 0)
            throw ApiException.badRequest("The meter reading for " + unit + " cannot be lower than " + meter.toPlainString());
    }

    static String damageDescription(String notes, String orderLabel) {
        return notes == null || notes.isBlank() ? "Damage recorded during the return of " + orderLabel : notes;
    }
}

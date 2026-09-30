package org.ash.inventory.mcp;

import io.quarkiverse.mcp.server.Prompt;
import io.quarkiverse.mcp.server.PromptArg;
import io.quarkiverse.mcp.server.PromptMessage;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class InventoryMcpPrompts {

    @Prompt(name = "event_readiness_audit", description = "Generates a prompt for auditing gear and equipment readiness for an event")
    public PromptMessage eventReadinessAudit(
            @PromptArg(name = "eventName", description = "Name of the target event", required = true) String eventName,
            @PromptArg(name = "focusArea", description = "Specific gear category to prioritize (e.g., Comms, Generators, Safety, Weapons)", required = false) String focusArea) {
        String prompt = "Please audit the equipment readiness for event '" + eventName + "'."
                + (focusArea != null && !focusArea.isBlank() ? " Focus especially on: " + focusArea + "." : "")
                + "\nSteps:"
                + "\n1. Check active item stock levels vs planned allocations."
                + "\n2. Verify maintenance status and condition of serialized assets."
                + "\n3. Highlight any deficits, overdue repairs, or missing return handovers."
                + "\n4. Provide an executive summary and recommended action items.";
        return PromptMessage.withUserRole(prompt);
    }

    @Prompt(name = "procurement_restock_plan", description = "Generates a prompt to review low stock items and formulate a purchasing plan")
    public PromptMessage procurementRestockPlan(
            @PromptArg(name = "supplierPreference", description = "Preferred supplier or note", required = false) String supplierPreference) {
        String prompt = "Review current inventory items below minStock threshold."
                + (supplierPreference != null && !supplierPreference.isBlank() ? " Preferred supplier: " + supplierPreference + "." : "")
                + "\nSteps:"
                + "\n1. Identify all items in critical deficit."
                + "\n2. Calculate recommended replenishment quantities."
                + "\n3. Group by supplier and estimate budget needed based on unit value."
                + "\n4. Draft a purchase recommendation summary.";
        return PromptMessage.withUserRole(prompt);
    }
}

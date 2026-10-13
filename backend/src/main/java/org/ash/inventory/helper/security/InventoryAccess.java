package org.ash.inventory.helper.security;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.InventoryAccessOrm;
import org.ash.inventory.resource.ApiException;

@ApplicationScoped
public class InventoryAccess {
    @Inject InventoryAccessOrm orm;
    /** Share management is never inherited: only the resource's own owner and the inventory admin. */
    public boolean manages(InventoryAccessPolicy policy, UserAccount actor) {
        return actor.role == DomainEnums.UserRole.admin || policy != null && policy.owner.id.equals(actor.id);
    }
    /**
     * Public resources are organization data (hidden from tenants). Private ones need ownership, a
     * direct or inherited grant (from the private locations they are stored in), or, for viewing, an
     * owner's offer for use.
     */
    public boolean allows(InventoryAccessPolicy policy, UserAccount actor, boolean edit) {
        if (policy == null) return ActorService.seesOrganization(actor);
        if (manages(policy, actor)) return true;
        if (!edit && policy.publicUse && ActorService.seesOrganization(actor)) return true;
        return orm.granted(policy, actor, edit);
    }
    public void require(InventoryAccessPolicy policy, UserAccount actor, boolean edit) {
        require(policy, actor, edit, false);
    }
    /** {@code usage}: ordering/takeout commands, where an item offered for use only needs view rights. */
    public void require(InventoryAccessPolicy policy, UserAccount actor, boolean edit, boolean usage) {
        // Serialize permission changes against every mutation of a protected resource, including
        // share changes on the locations it inherits from.
        if (policy != null && edit) {
            orm.lock(policy); orm.refresh(policy);
            orm.lockAncestorPolicies(policy);
            orm.lockGrantedGroups(policy);
        }
        if (allows(policy, actor, edit)) return;
        if (usage && edit && policy != null && policy.publicUse && allows(policy, actor, false)) return;
        throw ApiException.notFound("Resource not found");
    }
}

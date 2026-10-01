package org.ash.inventory.helper.security;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.InventoryAccessOrm;
import org.ash.inventory.resource.ApiException;

@ApplicationScoped
public class InventoryAccess {
    @Inject InventoryAccessOrm orm;
    public boolean manages(InventoryAccessPolicy policy, UserAccount actor) {
        return actor.role == DomainEnums.UserRole.hq_admin || policy != null && policy.owner.id.equals(actor.id);
    }
    public boolean allows(InventoryAccessPolicy policy, UserAccount actor, boolean edit) {
        return policy == null || manages(policy, actor) || orm.granted(policy, actor, edit);
    }
    public void require(InventoryAccessPolicy policy, UserAccount actor, boolean edit) {
        // Serialize permission changes against every mutation of a protected resource.
        if (policy != null && edit) { orm.lock(policy); orm.refresh(policy); orm.lockGrantedGroups(policy); }
        if (!allows(policy, actor, edit)) throw ApiException.notFound("Resource not found");
    }
}

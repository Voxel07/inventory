package org.ash.inventory.operations.internal.application;

import org.ash.inventory.notification.api.RecipientPolicy;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.UserAccount;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.UUID;
@ApplicationScoped
public class NotificationRecipientPolicy implements RecipientPolicy {
    @Inject EntityManager em;
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public Decision resolve(UUID recipientId,UUID orderId,UUID itemId) {
        var user=em.find(UserAccount.class,recipientId);
        boolean allowed=user!=null && user.active && user.email!=null && !user.email.isBlank();
        if(allowed && orderId!=null)allowed=visible("order",orderId,user);
        if(allowed && itemId!=null)allowed=visible("item",itemId,user);
        return new Decision(allowed,allowed?user.email:null);
    }
    private boolean visible(String kind,UUID id,UserAccount user) {
        return Boolean.TRUE.equals(em.createNativeQuery("select inventory_resource_visible(:kind,:id,:actor,:admin,:public)")
            .setParameter("kind",kind).setParameter("id",id).setParameter("actor",user.id)
            .setParameter("admin",user.role==DomainEnums.UserRole.admin).setParameter("public",user.role.atLeast(DomainEnums.UserRole.read_only)).getSingleResult());
    }
}

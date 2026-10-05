package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.UserOrm;
import org.ash.inventory.resource.ApiModels;

/** Accounts are provisioned from the identity provider; roles and factions are never edited here. */
@ApplicationScoped
public class UserService {
    private final UserOrm users;

    public UserService(UserOrm users) {
        this.users = users;
    }

    @Transactional
    public UserAccount devLogin(ApiModels.DevLoginInput input) {
        var user = users.findByIdentity(ActorService.DEV_ISSUER, input.email());
        if (user == null) {
            user = new UserAccount();
            user.issuer = ActorService.DEV_ISSUER;
            user.externalSubject = input.email();
            user.email = input.email();
            user.name = input.email().contains("@") ? input.email().substring(0, input.email().indexOf('@')) : input.email();
            user.role = DomainEnums.UserRole.hq_admin;
            users.persist(user);
        }
        return user;
    }
}

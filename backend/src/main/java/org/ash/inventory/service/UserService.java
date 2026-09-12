package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.UserOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;

import java.util.ArrayList;
import java.util.UUID;

@ApplicationScoped
public class UserService {
    private final ActorService actors;
    private final UserOrm users;

    public UserService(ActorService actors, UserOrm users) {
        this.actors = actors;
        this.users = users;
    }

    @Transactional
    public UserAccount devLogin(ApiModels.DevLoginInput input) {
        var user = users.findByExternalSubject(input.email());
        if (user == null) {
            user = new UserAccount();
            user.externalSubject = input.email();
            user.email = input.email();
            user.name = input.email().contains("@") ? input.email().substring(0, input.email().indexOf('@')) : input.email();
            user.role = DomainEnums.UserRole.hq_admin;
            users.persist(user);
        }
        return user;
    }

    @Transactional
    public UserAccount updatePermissions(UUID id, ApiModels.UserPermissionsInput input) {
        actors.requireAdmin();
        var user = users.find(id);
        if (user == null) throw ApiException.notFound("User not found");
        user.role = input.role();
        user.factions = input.faction() == null ? new ArrayList<>() : new ArrayList<>(input.faction());
        return user;
    }
}

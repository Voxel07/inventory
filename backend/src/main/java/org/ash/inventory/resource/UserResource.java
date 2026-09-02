package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.UserOrm;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class UserResource {
    @Inject ActorService actors;
    @Inject ApiMapper mapper;
    @Inject UserOrm orm;
    @ConfigProperty(name = "inventory.dev-auth.enabled", defaultValue = "false") boolean devAuthEnabled;

    @GET @Path("/auth/me") @Transactional
    public Object me() { return mapper.user(actors.current()); }

    @POST @Path("/auth/dev-login") @Transactional
    public Object devLogin(@Valid ApiModels.DevLoginInput input) {
        if (!devAuthEnabled) throw ApiException.notFound("Development login is disabled");
        var user = orm.findByExternalSubject(input.email());
        if (user == null) {
            user = new UserAccount();
            user.externalSubject = input.email();
            user.email = input.email();
            user.name = input.email().contains("@") ? input.email().substring(0, input.email().indexOf('@')) : input.email();
            user.role = DomainEnums.UserRole.admin;
            orm.persist(user);
        }
        return Map.of("token", "dev:" + user.externalSubject, "user", mapper.user(user));
    }

    @GET @Path("/users") @Transactional
    public List<?> users() { actors.requireManager(); return orm.users().stream().map(mapper::user).toList(); }

    @PATCH @Path("/users/{id}") @Transactional
    public Object updatePermissions(@PathParam("id") UUID id, @Valid ApiModels.UserPermissionsInput input) {
        actors.requireAdmin();
        var user = orm.find(id);
        if (user == null) throw ApiException.notFound("User not found");
        user.role = input.role();
        user.factions = input.faction() == null ? new ArrayList<>() : new ArrayList<>(input.faction());
        return mapper.user(user);
    }
}

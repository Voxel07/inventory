package org.ash.inventory.api;

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
import org.ash.inventory.domain.DomainEnums;
import org.ash.inventory.domain.UserAccount;
import org.ash.inventory.security.ActorService;
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
    @ConfigProperty(name = "inventory.dev-auth.enabled", defaultValue = "false") boolean devAuthEnabled;

    @GET @Path("/auth/me") @Transactional
    public Object me() { return mapper.user(actors.current()); }

    @POST @Path("/auth/dev-login") @Transactional
    public Object devLogin(@Valid ApiModels.DevLoginInput input) {
        if (!devAuthEnabled) throw ApiException.notFound("Development login is disabled");
        var user = UserAccount.<UserAccount>find("externalSubject", input.email()).firstResult();
        if (user == null) {
            user = new UserAccount();
            user.externalSubject = input.email();
            user.email = input.email();
            user.name = input.email().contains("@") ? input.email().substring(0, input.email().indexOf('@')) : input.email();
            user.role = DomainEnums.UserRole.admin;
            user.persist();
        }
        return Map.of("token", "dev:" + user.externalSubject, "user", mapper.user(user));
    }

    @GET @Path("/users") @Transactional
    public List<?> users() { actors.requireManager(); return UserAccount.<UserAccount>list("order by name, email").stream().map(mapper::user).toList(); }

    @PATCH @Path("/users/{id}") @Transactional
    public Object updatePermissions(@PathParam("id") UUID id, @Valid ApiModels.UserPermissionsInput input) {
        actors.requireAdmin();
        var user = UserAccount.<UserAccount>findById(id);
        if (user == null) throw ApiException.notFound("User not found");
        user.role = input.role();
        user.factions = input.faction() == null ? new ArrayList<>() : new ArrayList<>(input.faction());
        return mapper.user(user);
    }
}

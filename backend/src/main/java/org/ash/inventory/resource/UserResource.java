package org.ash.inventory.resource;

import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.service.ApiQueryService;
import org.ash.inventory.service.UserService;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class UserResource {
    private final ActorService actors;
    private final ApiMapper mapper;
    private final ApiQueryService queries;
    private final UserService users;
    private final boolean devAuthEnabled;

    public UserResource(ActorService actors, ApiMapper mapper, ApiQueryService queries, UserService users,
            @ConfigProperty(name = "inventory.dev-auth.enabled", defaultValue = "false") boolean devAuthEnabled) {
        this.actors = actors;
        this.mapper = mapper;
        this.queries = queries;
        this.users = users;
        this.devAuthEnabled = devAuthEnabled;
    }

    @GET @Path("/auth/me")
    public ApiResponses.UserResponse me() { return mapper.user(actors.current()); }

    @POST @Path("/auth/dev-login") @Transactional
    public ApiResponses.DevLoginResponse devLogin(@Valid ApiModels.DevLoginInput input) {
        if (!devAuthEnabled) throw ApiException.notFound("Development login is disabled");
        var user = users.devLogin(input);
        return new ApiResponses.DevLoginResponse("dev:" + user.externalSubject, mapper.user(user));
    }

    @GET @Path("/users")
    public List<ApiResponses.UserResponse> users(@jakarta.ws.rs.QueryParam("page") @DefaultValue("0") int page,
            @jakarta.ws.rs.QueryParam("size") @DefaultValue("100") int size) {
        return queries.users(page, size);
    }

    @PATCH @Path("/users/{id}") @Transactional
    public ApiResponses.UserResponse updatePermissions(@PathParam("id") UUID id, @Valid ApiModels.UserPermissionsInput input) {
        return mapper.user(users.updatePermissions(id, input));
    }
}

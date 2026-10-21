package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.ApiQueryService;
import org.ash.inventory.operations.internal.application.AuthSessionService;
import org.ash.inventory.operations.internal.application.UserService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.projection.ApiMapper;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.List;

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
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.AuthSessionService sessions;
    @POST @Path("/auth/logout") public void logout() { sessions.logout(actors.current().id); }

    @POST @Path("/auth/dev-login") @Transactional
    public ApiResponses.DevLoginResponse devLogin(@Valid ApiModels.DevLoginInput input) {
        if (!devAuthEnabled) throw ApiException.notFound("Development login is disabled");
        var user = users.devLogin(input);
        return new ApiResponses.DevLoginResponse("dev:" + user.externalSubject, mapper.user(user));
    }

    @Paged @GET @Path("/users")
    public List<ApiResponses.UserResponse> users(@jakarta.ws.rs.QueryParam("page") @DefaultValue("0") int page,
            @jakarta.ws.rs.QueryParam("size") @DefaultValue("100") int size,
            @jakarta.ws.rs.QueryParam("search") String search, @jakarta.ws.rs.QueryParam("role") String role) {
        return queries.users(search, role, page, size);
    }

    @Paged @GET @Path("/users/{id}/history")
    public List<ApiResponses.UserAccessHistoryResponse> history(@jakarta.ws.rs.PathParam("id") java.util.UUID id,
            @jakarta.ws.rs.QueryParam("page") @DefaultValue("0") int page,
            @jakarta.ws.rs.QueryParam("size") @DefaultValue("100") int size) {
        return queries.userAccessHistory(id, page, size);
    }

    /** Inventory admin sets role and faction memberships; Authentik only grants access to the system. */
    @jakarta.ws.rs.PATCH @Path("/users/{id}")
    public ApiResponses.UserResponse updateAccess(@jakarta.ws.rs.PathParam("id") java.util.UUID id, @Valid ApiModels.UserAccessInput input) {
        return mapper.user(users.updateAccess(id, input));
    }

    @Paged @GET @Path("/users/assignable")
    public List<ApiResponses.UserResponse> assignableUsers(
            @jakarta.ws.rs.QueryParam("search") String search,
            @jakarta.ws.rs.QueryParam("page") @DefaultValue("0") int page,
            @jakarta.ws.rs.QueryParam("size") @DefaultValue("100") int size) {
        return queries.assignableUsers(search, page, size);
    }
}

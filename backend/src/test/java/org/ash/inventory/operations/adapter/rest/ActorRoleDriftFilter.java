package org.ash.inventory.operations.adapter.rest;

import io.agroal.api.AgroalDataSource;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ResourceInfo;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.ext.Provider;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.Locale;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * Optional audit: development headers only seed new accounts, so a test that reuses an actor id with a different
 * {@code X-Actor-Role}/{@code X-Actor-Factions} silently runs as the stored account. Records each such request.
 * Enabled with {@code -Dinventory.test.actor-drift=<file>}; never part of the production application.
 */
@Provider
public class ActorRoleDriftFilter implements ContainerRequestFilter {
    @Inject AgroalDataSource dataSource;
    @Context ResourceInfo resource;

    @Override
    public void filter(ContainerRequestContext request) throws IOException {
        String output = System.getProperty("inventory.test.actor-drift");
        String actor = request.getHeaderString("X-Actor-Id");
        if (output == null || actor == null || request.getHeaderString("X-Impersonate-User") != null) return;
        String role = request.getHeaderString("X-Actor-Role");
        String factions = request.getHeaderString("X-Actor-Factions");
        String storedRoles;
        String storedFactions;
        try (var connection = dataSource.getConnection();
             var query = connection.prepareStatement(
                     "select roles::text, factions::text from app_users where issuer = 'dev' and external_subject = ?")) {
            query.setString(1, actor);
            try (var rows = query.executeQuery()) {
                if (!rows.next()) return;
                storedRoles = rows.getString(1);
                storedFactions = rows.getString(2);
            }
        } catch (SQLException ignored) {
            return;
        }
        String wantedRoles = normalized(role == null ? "admin" : role);
        String haveRoles = normalized(storedRoles);
        boolean roleDrift = !wantedRoles.equals(haveRoles);
        boolean factionDrift = factions != null && !normalized(factions).equals(normalized(storedFactions));
        if (!roleDrift && !factionDrift) return;
        String handler = resource.getResourceMethod() == null ? "?" : resource.getResourceClass().getSimpleName() + "." + resource.getResourceMethod().getName();
        String row = String.join("\t", actor, request.getMethod(), request.getUriInfo().getPath(), handler,
                "header=" + wantedRoles + (factions == null ? "" : " factions=" + normalized(factions)),
                "stored=" + haveRoles + " factions=" + normalized(storedFactions)) + "\n";
        synchronized (ActorRoleDriftFilter.class) {
            Files.writeString(Path.of(output), row, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        }
    }

    private static String normalized(String value) {
        if (value == null) return "[]";
        return Arrays.stream(value.replaceAll("[\\[\\]\"]", "").split(","))
                .map(part -> part.trim().toLowerCase(Locale.ROOT)).filter(part -> !part.isEmpty())
                .collect(Collectors.toCollection(TreeSet::new)).toString();
    }
}

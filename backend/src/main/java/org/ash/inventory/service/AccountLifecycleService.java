package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.UserOrm;
import org.ash.inventory.resource.ApiException;
import java.time.Instant;
import java.util.*;

/** Deactivation blocks every transport; ownership changes preserve the existing obligation checks. */
@ApplicationScoped
public class AccountLifecycleService {
    @Inject ActorService actors;
    @Inject UserOrm users;
    @Inject EntityManager em;
    @Inject DomainEventService events;
    @Inject CustodyBalanceService custody;
    @Inject InventoryAccessService access;
    public record StatusInput(@NotNull Boolean active, @NotNull Long revision, @NotBlank @Size(max=1000) String reason) {}
    public record Resource(UUID policyId, String kind, UUID id, String name) {}
    public record Overview(boolean active, long revision, Instant deactivatedAt, long keeperAssignments,
            List<CustodyBalanceService.Balance> custody, List<Resource> resources, boolean moreResources) {}
    public record TransferInput(@NotNull UUID successorId, @NotEmpty @Size(max=200) List<@NotNull UUID> policyIds,
            @NotBlank @Size(max=1000) String reason) {}
    public record TransferResult(List<UUID> transferred, Map<UUID, String> blocked) {}

    @Transactional
    public Overview overview(UUID id) {
        actors.requireAdmin(); var user = required(id);
        long keepers = em.createQuery("select count(l) from StorageLocation l where l.keeperUser.id = :id", Long.class).setParameter("id", id).getSingleResult();
        var resources = owned(id, 201);
        return new Overview(user.active, user.accessRevision, user.deactivatedAt, keepers,
                custody.list(false).stream().filter(b -> id.equals(b.personId())).toList(), resources.stream().limit(200).toList(), resources.size() > 200);
    }

    @Transactional
    public void status(UUID id, StatusInput input) {
        actors.requireAdmin(); var actor = actors.current(); users.lockAdmins(); var user = users.findLocked(id);
        if (user == null) throw ApiException.notFound("User not found");
        if (input.revision() != user.accessRevision) throw ApiException.conflict("User changed; reload");
        if (!input.active() && actor.id.equals(id)) throw ApiException.badRequest("Another administrator must deactivate this account");
        if (!input.active() && user.active && user.role == DomainEnums.UserRole.admin && users.admins() <= 1)
            throw ApiException.conflict("Keep at least one active inventory administrator");
        user.active = input.active(); user.deactivatedAt = user.active ? null : Instant.now();
        user.offboardingReason = input.reason().trim(); user.accessRevision++;
        events.record("user.changed", "user", id, actor.id, null, Map.of("active", user.active, "reason", input.reason()));
    }

    public TransferResult transfer(UUID id, TransferInput input) {
        actors.requireAdmin();
        if (id.equals(input.successorId())) throw ApiException.badRequest("Select another active owner");
        var transferred = new ArrayList<UUID>(); var blocked = new LinkedHashMap<UUID, String>();
        for (var policy : new LinkedHashSet<>(input.policyIds())) {
            try { transferOne(id, policy, input.successorId(), input.reason()); transferred.add(policy); }
            catch (ApiException exception) { blocked.put(policy, exception.getMessage()); }
        }
        return new TransferResult(transferred, blocked);
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void transferOne(UUID owner, UUID policy, UUID successor, String reason) {
        actors.requireAdmin();
        if (!required(successor).active) throw ApiException.badRequest("The successor must be active");
        var group=em.find(InventoryAccessGroup.class,policy,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if(group!=null && group.owner!=null && owner.equals(group.owner.id)) {
            group.owner=required(successor);group.revision++;
            events.record("access.group_changed","access_group",group.id,actors.current().id,null,Map.of("oldOwner",owner,"owner",successor,"reason",reason));
            return;
        }
        Resource resource = null;
        for (String kind : List.of("Item", "StorageLocation", "Assembly")) {
            var rows = em.createQuery("select r.id, r.name from " + kind + " r where r.accessPolicy.id = :policy and r.accessPolicy.owner.id = :owner", Object[].class)
                    .setParameter("policy", policy).setParameter("owner", owner).setMaxResults(1).getResultList();
            if (!rows.isEmpty()) { var row = rows.getFirst(); resource = new Resource(policy,
                    kind.equals("Item") ? "items" : kind.equals("StorageLocation") ? "storage-locations" : "assemblies", (UUID) row[0], (String) row[1]); break; }
        }
        if (resource == null) throw ApiException.notFound("Owned resource not found");
        var view = access.get(resource.kind(), resource.id());
        access.update(resource.kind(), resource.id(), new InventoryAccessService.Input(view.revision(), view.grants(), successor, reason, null));
    }

    private List<Resource> owned(UUID owner, int limit) {
        var result = new ArrayList<Resource>();
        for (String kind : List.of("Item", "StorageLocation", "Assembly")) {
            String api = kind.equals("Item") ? "items" : kind.equals("StorageLocation") ? "storage-locations" : "assemblies";
            for (var row : em.createQuery("select r.accessPolicy.id, r.id, r.name from " + kind + " r where r.accessPolicy.owner.id = :owner order by r.id", Object[].class)
                    .setParameter("owner", owner).setMaxResults(limit).getResultList()) {
                result.add(new Resource((UUID) row[0], api, (UUID) row[1], (String) row[2]));
                if (result.size() >= limit) return result;
            }
        }
        if(result.size()<limit) for(var group:em.createQuery("from InventoryAccessGroup where owner.id=:owner order by id",InventoryAccessGroup.class).setParameter("owner",owner).setMaxResults(limit-result.size()).getResultList())
            result.add(new Resource(group.id,"groups",group.id,group.name));
        return result;
    }
    private UserAccount required(UUID id) { var user = users.find(id); if (user == null) throw ApiException.notFound("User not found"); return user; }
}

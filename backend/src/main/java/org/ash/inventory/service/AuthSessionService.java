package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.jwt.JsonWebToken;
import org.ash.inventory.helper.security.ActorService;
import io.quarkus.security.identity.SecurityIdentity;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

/** Server-side logout rejects the current access token independently of provider introspection. */
@ApplicationScoped
public class AuthSessionService {
    final EntityManager em;
    final SecurityIdentity identity;
    final ActorService actors;

    public AuthSessionService(EntityManager em, SecurityIdentity identity, ActorService actors) {
        this.em = em;
        this.identity = identity;
        this.actors = actors;
    }

    @Transactional
    public boolean revoked(JsonWebToken token) {
        return !em.createNativeQuery("select 1 from revoked_sessions where token_hash = :hash and expires_at > now()")
                .setParameter("hash", fingerprint(token)).setMaxResults(1).getResultList().isEmpty();
    }

    @Transactional
    public void logout() {
        var actor = actors.current();
        if (!(identity.getPrincipal() instanceof JsonWebToken token)) return;
        em.createNativeQuery("insert into revoked_sessions(token_hash, user_id, expires_at) values (:hash,:actor,:expires) on conflict do nothing")
                .setParameter("hash", fingerprint(token)).setParameter("actor", actor.id)
                .setParameter("expires", Instant.ofEpochSecond(token.getExpirationTime())).executeUpdate();
    }

    public static String fingerprint(JsonWebToken token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getRawToken().getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public boolean streamAllowed(java.util.UUID actorId, String tokenHash) {
        return !em.createNativeQuery("select 1 from app_users u where u.id=:id and u.active=true and not exists(select 1 from revoked_sessions r where r.token_hash=:hash and r.expires_at>now())")
                .setParameter("id",actorId).setParameter("hash",tokenHash == null ? "" : tokenHash).getResultList().isEmpty();
    }

    @io.quarkus.scheduler.Scheduled(every = "1h", concurrentExecution = io.quarkus.scheduler.Scheduled.ConcurrentExecution.SKIP)
    @Transactional
    void purge() { em.createNativeQuery("delete from revoked_sessions where expires_at < now()").executeUpdate(); }
}

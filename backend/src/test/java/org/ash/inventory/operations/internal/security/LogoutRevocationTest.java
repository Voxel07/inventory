package org.ash.inventory.operations.internal.security;

import org.ash.inventory.operations.internal.application.AuthSessionService;
import org.ash.inventory.operations.internal.persistence.UserOrm;
import org.ash.inventory.platform.api.ApiException;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.security.runtime.QuarkusSecurityIdentity;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.eclipse.microprofile.jwt.JsonWebToken;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
class LogoutRevocationTest {
    @Inject EntityManager em;
    @Inject UserOrm users;
    @Test void logoutRejectsTheBearerOnTheNextRequestAndStreamRecheck() {
        String subject="logout-"+UUID.randomUUID();
        var claims=Map.<String,Object>of("iss","https://identity.example.test","sub",subject,"exp",Instant.now().plusSeconds(300).getEpochSecond(),"raw_token","isolated-fixture-"+UUID.randomUUID());
        var token=new JsonWebToken(){
            public String getName(){return subject;}
            public Set<String> getClaimNames(){return claims.keySet();}
            @SuppressWarnings("unchecked") public <T>T getClaim(String name){return (T)claims.get(name);}
        };
        var identity=QuarkusSecurityIdentity.builder().setPrincipal(token).addRole("inventory").build();
        var actor=new ActorService(identity,null,users,false,"inventory",Optional.empty());
        var sessions=new AuthSessionService(em,identity);actor.sessions=sessions;
        UUID id=QuarkusTransaction.requiringNew().call(()->actor.current().id);
        QuarkusTransaction.requiringNew().run(()->{
            assertTrue(sessions.streamAllowed(id,AuthSessionService.fingerprint(token)));
            sessions.logout(actor.current().id);
            assertTrue(sessions.revoked(token));
            assertFalse(sessions.streamAllowed(id,AuthSessionService.fingerprint(token)));
        });
        var nextRequest=new ActorService(identity,null,users,false,"inventory",Optional.empty());nextRequest.sessions=sessions;
        var failure=assertThrows(ApiException.class,()->QuarkusTransaction.requiringNew().run(nextRequest::current));
        assertEquals(401,failure.status);
    }
}

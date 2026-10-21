package org.ash.inventory.platform.ratelimit;

import org.ash.inventory.platform.api.ApiException;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
/** Transport-independent per-caller budget shared by REST and MCP. */
@ApplicationScoped
public class ApiBudget {
    @Inject SecurityIdentity identity;
    @Inject DistributedRateLimiterService limiter;
    @ConfigProperty(name="inventory.api.rate-limit.requests",defaultValue="300") int limit;
    @ConfigProperty(name="inventory.api.rate-limit.window-seconds",defaultValue="60") long window;
    public RateLimiter.Result tryAcquire(String caller){return limiter.tryAcquire(caller,limit,window);}
    public void acquire(String caller){var result=tryAcquire(caller);if(!result.allowed())throw new ApiException(429,"API rate limit exceeded; retry after "+result.retryAfterSeconds()+" seconds");}
    public String caller(String actorId){return identity!=null && !identity.isAnonymous()?"subject:"+identity.getPrincipal().getName():"actor:"+actorId;}
}

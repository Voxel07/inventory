package org.ash.inventory.platform.runtime;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.ConfigProvider;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import java.util.Set;

/** Runtime process roles; job selection permits separate worker pools from the same image. */
@ApplicationScoped
public class WorkerRoles {
    private static final Set<String> JOBS = Set.of("outbox", "notifications", "reminders", "digests", "reports", "media", "retention", "sessions");
    @ConfigProperty(name = "inventory.process-role", defaultValue = "all") String role;
    @ConfigProperty(name = "inventory.worker-jobs", defaultValue = "all") String jobs;
    private Set<String> selected;

    @PostConstruct
    void validate() {
        if (!Set.of("all", "api", "worker").contains(role)) throw new IllegalArgumentException("Invalid inventory.process-role");
        selected = Set.copyOf(java.util.Arrays.stream(jobs.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
        if (selected.isEmpty() || selected.stream().anyMatch(s -> !s.equals("all") && !JOBS.contains(s)))
            throw new IllegalArgumentException("Invalid inventory.worker-jobs");
    }

    public boolean servesRequests() { return !role.equals("worker"); }
    public boolean enabled(String job) {
        if (!JOBS.contains(job)) throw new IllegalArgumentException("Unknown inventory job: " + job);
        return !role.equals("api") && (selected.contains("all") || selected.contains(job))
                && ConfigProvider.getConfig().getOptionalValue("inventory.workers." + job + ".enabled", Boolean.class).orElse(true);
    }
}

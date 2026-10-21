package org.ash.inventory;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.persistence.StockFactsOrm;
import org.ash.inventory.platform.persistence.ConsistentRead;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.util.*;
@ApplicationScoped
public class SnapshotProbe {
    @Inject StockFactsOrm facts;
    @ConsistentRead @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<Long> read(UUID id, Runnable concurrentCommit) {
        long first = facts.load(List.of(id)).totals().get(id).get(DomainEnums.TransactionType.checkout);
        concurrentCommit.run();
        long second = facts.load(List.of(id)).totals().get(id).get(DomainEnums.TransactionType.checkout);
        return List.of(first, second);
    }
}

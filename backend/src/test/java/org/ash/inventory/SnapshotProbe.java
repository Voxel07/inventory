package org.ash.inventory;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.ConsistentRead;
import org.ash.inventory.orm.StockFactsOrm;
import org.ash.inventory.model.DomainEnums;
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

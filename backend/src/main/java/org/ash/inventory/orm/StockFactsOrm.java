package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.DomainEnums;
import java.util.*;

/** Independent facts are preaggregated before UNION, never multiplied by collection joins. */
@ApplicationScoped
public class StockFactsOrm {
    private final EntityManager em;
    public StockFactsOrm(EntityManager em) { this.em = em; }
    public record Facts(Map<UUID, Map<DomainEnums.TransactionType, Long>> totals,
                        Map<UUID, Long> damage, Map<UUID, Long> reservations, Set<UUID> memberDamage) {}
    public Facts load(Collection<UUID> ids) {
        var totals = new HashMap<UUID, Map<DomainEnums.TransactionType, Long>>();
        var damage = new HashMap<UUID, Long>();
        var reservations = new HashMap<UUID, Long>();
        var memberDamage = new HashSet<UUID>();
        if (ids.isEmpty()) return new Facts(totals, damage, reservations, memberDamage);
        var query = em.createNativeQuery("""
                with scope as (select id from items where id in (:ids))
                select 'ledger' as kind, t.item_id, t.type as subtype, sum(t.quantity) as quantity,
                    sum(case when t.custody_write_off then t.quantity else 0 end) as custody
                from stock_transactions t join scope s on s.id = t.item_id group by t.item_id, t.type
                union all
                select 'damage', d.item_id, null, sum(d.quantity - d.repaired_quantity - d.written_off_quantity), 0
                from damage_reports d join scope s on s.id = d.item_id
                where d.status in ('reported','triaged','awaiting_repair','in_review','in_repair','repaired','verified') group by d.item_id
                union all
                select 'reservation', r.item_id, null, sum(r.reserved_quantity - r.released_quantity), 0
                from stock_reservations r join scope s on s.id = r.item_id
                where r.status in ('active','partially_released') group by r.item_id
                union all
                select 'reservation', s.id, null, sum(q.value::bigint), 0
                from general_orders o cross join lateral jsonb_each_text(o.prepared_quantities) q
                join scope s on lower(q.key) = s.id::text where o.status in ('preparing','ready') group by s.id
                union all
                select 'member_damage', r.item_id, null, 0, 0
                from member_requests r join scope s on s.id = r.item_id
                where r.kind = 'damage' and r.status <> 'resolved' group by r.item_id
                """, Object[].class).unwrap(org.hibernate.query.NativeQuery.class);
        query.addScalar("kind", String.class).addScalar("item_id", UUID.class)
                .addScalar("subtype", String.class).addScalar("quantity", Long.class).addScalar("custody", Long.class);
        var custody = new HashMap<UUID, Long>();
        for (var value : query.setParameter("ids", ids).getResultList()) {
            var row = (Object[]) value; var id = (UUID) row[1]; long quantity = ((Number) row[3]).longValue();
            switch ((String) row[0]) {
                case "ledger" -> {
                    totals.computeIfAbsent(id, ignored -> new EnumMap<>(DomainEnums.TransactionType.class))
                            .put(DomainEnums.TransactionType.valueOf((String) row[2]), quantity);
                    custody.merge(id, ((Number) row[4]).longValue(), Long::sum);
                }
                case "damage" -> damage.put(id, quantity);
                case "reservation" -> reservations.merge(id, quantity, Long::sum);
                case "member_damage" -> memberDamage.add(id);
                default -> throw new IllegalStateException("Unknown stock fact");
            }
        }
        custody.forEach((id, quantity) -> {
            if (quantity != 0) {
                totals.get(id).merge(DomainEnums.TransactionType.written_off, -quantity, Long::sum);
                totals.get(id).merge(DomainEnums.TransactionType.consumed, quantity, Long::sum);
            }
        });
        return new Facts(totals, damage, reservations, memberDamage);
    }
}

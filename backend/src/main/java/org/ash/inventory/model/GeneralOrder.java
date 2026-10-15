package org.ash.inventory.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.ToIntFunction;

@Entity
@Table(name = "general_orders")
public class GeneralOrder extends BaseEntity {
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "pickup_assignments", columnDefinition = "jsonb", nullable = false)
    public Map<String, PickupAssignment> pickupAssignments = new LinkedHashMap<>();
    @Column(nullable = false, length = 160) public String name;
    @Column(nullable = false, length = 4000) public String purpose;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by") public UserAccount createdBy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "event_occurrence_id") public EventOccurrence eventOccurrence;
    @Column(nullable = false) public String status = "draft";
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true) @OrderBy("lineNumber") @BatchSize(size = 64)
    public List<GeneralOrderLine> lines = new ArrayList<>();

    public GeneralOrderLine line(UUID itemId) {
        return lines.stream().filter(line -> line.item.id.equals(itemId)).findFirst().orElse(null);
    }

    /** One line quantity per item id in line order; zero quantities are omitted. */
    public Map<String, Integer> quantities(ToIntFunction<GeneralOrderLine> quantity) {
        var result = new LinkedHashMap<String, Integer>();
        for (var line : lines) {
            int value = quantity.applyAsInt(line);
            if (value != 0) result.put(line.item.id.toString(), value);
        }
        return result;
    }

    /** One per-line value per item id in line order; empty values are omitted. */
    public <T> Map<String, T> perItem(Function<GeneralOrderLine, T> value) {
        var result = new LinkedHashMap<String, T>();
        for (var line : lines) {
            var entry = value.apply(line);
            if (entry != null && !(entry instanceof List<?> list && list.isEmpty())) result.put(line.item.id.toString(), entry);
        }
        return result;
    }
}

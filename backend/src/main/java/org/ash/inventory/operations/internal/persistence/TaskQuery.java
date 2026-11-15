package org.ash.inventory.operations.internal.persistence;

import jakarta.persistence.TypedQuery;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.Inputs;
import java.util.LinkedHashMap;
import java.util.Map;

/** Small parameterized predicate builder shared by the warehouse lists. */
final class TaskQuery {
    private final StringBuilder hql;
    private final Map<String, Object> parameters = new LinkedHashMap<>();

    TaskQuery(String hql) { this.hql = new StringBuilder(hql); }

    TaskQuery where(String predicate) { hql.append(" and ").append(predicate); return this; }

    TaskQuery parameter(String key, Object value) { parameters.put(key, value); return this; }

    TaskQuery searchWhere(String search, String predicate) {
        if (search != null && !search.isBlank()) {
            where(predicate);
            parameters.put("search", Inputs.containsPattern(search));
        }
        return this;
    }

    TaskQuery equal(String expression, String parameter, Object value) {
        if (value != null) { where(expression + " = :" + parameter); parameters.put(parameter, value); }
        return this;
    }

    TaskQuery search(String search, String... expressions) {
        if (search == null || search.isBlank()) return this;
        where("(" + java.util.Arrays.stream(expressions).map(e -> "lower(" + e + ") like :search escape '!'")
                .collect(java.util.stream.Collectors.joining(" or ")) + ")");
        parameters.put("search", Inputs.containsPattern(search));
        return this;
    }

    <E extends Enum<E>> TaskQuery status(String expression, String status, Class<E> type, java.util.List<E> finished) {
        if (status == null || status.isBlank()) return this;
        if (status.equals("open") || status.equals("history")) {
            if (finished.isEmpty()) throw ApiException.badRequest("Choose an exact status for this task list");
            where(expression + (status.equals("open") ? " not in :finished" : " in :finished"));
            parameters.put("finished", finished);
        } else {
            try { equal(expression, "taskStatus", Enum.valueOf(type, status)); }
            catch (IllegalArgumentException e) { throw ApiException.badRequest("Unknown task status"); }
        }
        return this;
    }

    String ordered(String order) { return hql + " order by " + order; }
    <T> TypedQuery<T> bind(TypedQuery<T> query) { parameters.forEach(query::setParameter); return query; }
}

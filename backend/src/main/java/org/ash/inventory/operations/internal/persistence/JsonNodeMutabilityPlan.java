package org.ash.inventory.operations.internal.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.Serializable;
import org.hibernate.SharedSessionContract;
import org.hibernate.type.descriptor.java.MutableMutabilityPlan;

/** Hibernate snapshots JSON trees without Java object serialization (including in native images). */
public final class JsonNodeMutabilityPlan extends MutableMutabilityPlan<JsonNode> {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    protected JsonNode deepCopyNotNull(JsonNode value) {
        return value.deepCopy();
    }

    @Override
    public Serializable disassemble(JsonNode value, SharedSessionContract session) {
        return value == null ? null : value.toString();
    }

    @Override
    public JsonNode assemble(Serializable cached, SharedSessionContract session) {
        if (cached == null) return null;
        try {
            return JSON.readTree((String) cached);
        } catch (JsonProcessingException invalid) {
            throw new IllegalArgumentException("Invalid cached JSON tree", invalid);
        }
    }
}

package org.ash.inventory.operations.adapter.mcp;

import com.github.victools.jsonschema.generator.CustomDefinition;
import com.github.victools.jsonschema.generator.CustomDefinitionProviderV2;
import com.github.victools.jsonschema.generator.SchemaGeneratorConfigBuilder;
import io.quarkiverse.mcp.server.runtime.SchemaGeneratorConfigCustomizer;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.time.LocalDate;

/** MCP tool schemas describe the same numeric dates accepted by Jackson. */
@Singleton
public class EpochSchemaCustomizer implements SchemaGeneratorConfigCustomizer {
    @Override public void customize(SchemaGeneratorConfigBuilder builder) {
        builder.with((CustomDefinitionProviderV2) (type, context) -> {
            var javaType = type.getErasedType();
            if (javaType != Instant.class && javaType != LocalDate.class) return null;
            var schema = builder.getObjectMapper().createObjectNode();
            schema.put("type", "integer").put("format", "int64");
            schema.put("description", javaType == LocalDate.class
                    ? "Epoch milliseconds at midnight UTC (calendar date)" : "Epoch milliseconds (instant)");
            return new CustomDefinition(schema, true);
        });
    }
}

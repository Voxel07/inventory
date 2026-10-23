package org.ash.inventory.platform.api;

import org.eclipse.microprofile.openapi.OASFilter;
import org.eclipse.microprofile.openapi.models.media.Schema;
import java.util.List;

/** Keep generated API documentation aligned with the global epoch JSON contract. */
public class EpochOpenApiFilter implements OASFilter {
    @Override public Schema filterSchema(Schema schema) {
        if ("date".equals(schema.getFormat()) || "date-time".equals(schema.getFormat())) {
            boolean calendarDate = "date".equals(schema.getFormat());
            schema.setType(List.of(Schema.SchemaType.INTEGER));
            schema.setFormat("int64");
            schema.setDescription(calendarDate ? "Epoch milliseconds at midnight UTC (calendar date)" : "Epoch milliseconds (instant)");
        }
        return schema;
    }
}

package org.ash.inventory.platform.api;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.module.SimpleModule;
import io.quarkus.jackson.ObjectMapperCustomizer;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.function.LongFunction;
import java.util.function.ToLongFunction;

/** All JSON entry points, including sync payloads and report snapshots, share the same contract. */
@Singleton
public class EpochJson implements ObjectMapperCustomizer {
    /** Register after Quarkus's JavaTimeModule so its ISO/epoch-seconds handlers cannot replace ours. */
    @Override public int priority() { return MINIMUM_PRIORITY; }

    @Override public void customize(ObjectMapper mapper) {
        var module = new SimpleModule("epoch-milliseconds");
        register(module, Instant.class, Instant::toEpochMilli, Instant::ofEpochMilli);
        register(module, LocalDate.class, EpochTime::millis, EpochTime::date);
        mapper.registerModule(module);
    }

    private static <T> void register(SimpleModule module, Class<T> type, ToLongFunction<T> encode, LongFunction<T> decode) {
        module.addSerializer(type, new JsonSerializer<T>() {
            @Override public void serialize(T value, JsonGenerator generator, SerializerProvider provider) throws IOException {
                generator.writeNumber(encode.applyAsLong(value));
            }
        });
        module.addDeserializer(type, new JsonDeserializer<T>() {
            @Override public T deserialize(JsonParser parser, DeserializationContext context) throws IOException {
                if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT))
                    return type.cast(context.handleUnexpectedToken(type, parser));
                long millis = parser.getLongValue();
                try { return decode.apply(millis); }
                catch (IllegalArgumentException invalid) {
                    return type.cast(context.handleWeirdNumberValue(type, millis, invalid.getMessage()));
                }
            }
        });
    }
}

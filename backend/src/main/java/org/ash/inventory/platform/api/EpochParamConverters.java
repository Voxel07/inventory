package org.ash.inventory.platform.api;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.ext.ParamConverter;
import jakarta.ws.rs.ext.ParamConverterProvider;
import jakarta.ws.rs.ext.Provider;
import java.lang.annotation.Annotation;
import java.lang.reflect.Type;
import java.time.Instant;
import java.time.LocalDate;

@Provider
public class EpochParamConverters implements ParamConverterProvider {
    @Override public <T> ParamConverter<T> getConverter(Class<T> rawType, Type genericType, Annotation[] annotations) {
        if (rawType != Instant.class && rawType != LocalDate.class) return null;
        return new ParamConverter<>() {
            @Override public T fromString(String value) {
                if (value == null) return null;
                try {
                    long millis = Long.parseLong(value);
                    return rawType.cast(rawType == Instant.class ? Instant.ofEpochMilli(millis) : EpochTime.date(millis));
                } catch (IllegalArgumentException invalid) {
                    throw new BadRequestException("Dates must be epoch milliseconds; calendar dates must be midnight UTC", invalid);
                }
            }
            @Override public String toString(T value) {
                return value == null ? null : Long.toString(value instanceof Instant instant ? instant.toEpochMilli() : EpochTime.millis((LocalDate) value));
            }
        };
    }
}

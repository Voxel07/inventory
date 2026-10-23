package org.ash.inventory.platform.persistence;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.time.LocalDate;
import org.ash.inventory.platform.api.EpochTime;

@Converter(autoApply = true)
public class LocalDateEpochConverter implements AttributeConverter<LocalDate, Long> {
    @Override public Long convertToDatabaseColumn(LocalDate value) { return value == null ? null : EpochTime.millis(value); }
    @Override public LocalDate convertToEntityAttribute(Long value) { return value == null ? null : EpochTime.date(value); }
}

package org.ash.inventory.operations.internal.contract.dto;

import org.ash.inventory.platform.api.InputText;

import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class CsvImportDtos {
    private CsvImportDtos() {}
    public record Upload(@NotNull UUID commandId, @NotBlank @InputText String filename,
            @NotBlank @InputText(max = 64) String timezone, @NotNull ObjectNode plan) {}
    public record Job(UUID id, String filename, String status, int progress, int totalRows, int processedRows,
            ObjectNode result, Instant createdAt, Instant updatedAt) {}
}

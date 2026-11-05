package org.ash.inventory.platform.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.TransferDtos;
import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class InputValidationTest {
    private final ObjectMapper json = new ObjectMapper();

    InputValidationTest() { new InputJson().customize(json); new EpochJson().customize(json); }

    private void invalid(String body, Class<?> type) throws Exception {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertFalse(factory.getValidator().validate(json.readValue(body, type)).isEmpty());
        }
    }

    @Test void validatesNamesNumbersAndNestedCollections() throws Exception {
        invalid("{\"name\":\"" + "x".repeat(256) + "\",\"category\":\"C\"}", ApiModels.ItemInput.class);
        invalid("{\"name\":\"N\\u0000x\",\"category\":\"C\"}", ApiModels.ItemInput.class);
        invalid("{\"name\":\"N\",\"category\":\"C\",\"value\":21474836.48}", ApiModels.ItemInput.class);
        invalid("{\"name\":\"N\",\"category\":\"C\",\"currentOperatingHours\":1e1000000}", ApiModels.ItemInput.class);
        invalid("{\"name\":\"N\",\"category\":\"C\",\"currentOperatingHours\":1e2147483647}", ApiModels.ItemInput.class);
        invalid("{\"name\":\"N\",\"latitude\":91}", ApiModels.StorageLocationInput.class);
        invalid("{\"name\":\"N\",\"overlayBounds\":[[0]]}", ApiModels.StorageLocationInput.class);
        invalid("{\"actions\":[null]}", ApiModels.SyncBatch.class);
        invalid("{\"idempotencyKey\":\"" + UUID.randomUUID() + "\",\"lines\":[null]}", TransferDtos.ReceiveInput.class);
        invalid("{\"name\":\"kit\",\"itemQuantities\":{\"" + UUID.randomUUID() + "\":null}}", ApiModels.AssemblyInput.class);
    }

    @Test void keepsPlainTextIncludingMarkupAndNewlines() throws Exception {
        var item = json.readValue("{\"name\":\"<script>alert(1)</script>\",\"category\":\"C\",\"description\":\"line 1\\nline 2\"}", ApiModels.ItemInput.class);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertTrue(factory.getValidator().validate(item).isEmpty());
        }
        assertEquals("<script>alert(1)</script>", item.name());
    }

    @Test void rejectsAmbiguousOrExpensiveJson() {
        assertThrows(Exception.class, () -> json.readTree("[".repeat(65) + "0" + "]".repeat(65)));
        assertThrows(Exception.class, () -> json.readTree("{\"name\":1,\"name\":2}"));
        assertThrows(Exception.class, () -> json.readValue("{\"quantity\":1.5}", ApiModels.RestockInput.class));
        assertThrows(Exception.class, () -> json.readValue("{\"name\":\"N\",\"category\":\"C\",\"trackingMode\":0}", ApiModels.ItemInput.class));
        assertEquals(400, assertThrows(ApiException.class, () -> Inputs.addQuantity(Integer.MAX_VALUE, 1)).status);
        assertThrows(IllegalArgumentException.class, () -> EpochTime.date(Long.MIN_VALUE));
    }

    @Test void rawJsonEnvelopesCannotBypassValidation() throws Exception {
        assertThrows(ApiException.class, () -> Inputs.validateJson(json.readTree("{\"unknown\":\"bad\\u0000text\"}")));
        assertThrows(ApiException.class, () -> Inputs.validateJson(json.readTree("{\"number\":1e1000000}")));
        assertThrows(ApiException.class, () -> Inputs.validateJson(json.readTree("{\"number\":9223372036854775808}")));
    }
}

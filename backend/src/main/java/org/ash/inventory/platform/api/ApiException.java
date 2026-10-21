package org.ash.inventory.platform.api;

import java.util.Map;

public class ApiException extends RuntimeException {
    public final int status;
    /** Machine-readable context for the client, e.g. the failing entry of a batch. */
    public final Map<String, Object> details;
    public ApiException(int status, String message) { this(status, message, null); }
    public ApiException(int status, String message, Map<String, Object> details) { super(message); this.status = status; this.details = details; }
    public static ApiException badRequest(String message) { return new ApiException(400, message); }
    public static ApiException forbidden(String message) { return new ApiException(403, message); }
    public static ApiException notFound(String message) { return new ApiException(404, message); }
    public static ApiException conflict(String message) { return new ApiException(409, message); }
}

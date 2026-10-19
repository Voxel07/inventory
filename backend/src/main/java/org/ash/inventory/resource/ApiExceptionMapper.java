package org.ash.inventory.resource;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import java.util.Map;

@Provider
public class ApiExceptionMapper implements ExceptionMapper<ApiException> {
    @Override
    public Response toResponse(ApiException exception) {
        var status = Response.Status.fromStatusCode(exception.status);
        return Response.status(exception.status)
                .type("application/problem+json")
                .entity(new ProblemDetails("about:blank", status == null ? "Request failed" : status.getReasonPhrase(),
                        exception.status, exception.getMessage(), exception.getMessage(), exception.details))
                .build();
    }

    public record ProblemDetails(String type, String title, int status, String detail, String error, Map<String, Object> details) {}
}

package org.ash.inventory.operations.adapter.rest;

import jakarta.persistence.OptimisticLockException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

/** A concurrent command changed a versioned row first: a retryable conflict, not a server error. */
@Provider
public class OptimisticLockExceptionMapper implements ExceptionMapper<OptimisticLockException> {
    @Override
    public Response toResponse(OptimisticLockException exception) {
        String message = "The data was changed by another request; reload and try again";
        return Response.status(409).type("application/problem+json")
                .entity(new ApiExceptionMapper.ProblemDetails("about:blank", "Conflict", 409, message, message, null)).build();
    }
}

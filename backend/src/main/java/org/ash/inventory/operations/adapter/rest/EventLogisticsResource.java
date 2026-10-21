package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.contract.dto.EventLogisticsDtos.AccountOption;
import org.ash.inventory.operations.internal.contract.dto.EventLogisticsDtos.AttendeeInput;
import org.ash.inventory.operations.internal.contract.dto.EventLogisticsDtos.AttendeeResponse;
import org.ash.inventory.operations.internal.contract.dto.EventLogisticsDtos.CateringSettings;
import org.ash.inventory.operations.internal.contract.dto.EventLogisticsDtos.PersonInput;
import org.ash.inventory.operations.internal.contract.dto.EventLogisticsDtos.PersonResponse;
import org.ash.inventory.operations.internal.contract.dto.EventLogisticsDtos.TimelineInput;
import org.ash.inventory.operations.internal.contract.dto.EventLogisticsDtos.TimelineResponse;

import org.ash.inventory.operations.internal.application.EventLogisticsService;

import jakarta.validation.Valid;

import jakarta.ws.rs.Consumes;

import jakarta.ws.rs.DELETE;

import jakarta.ws.rs.GET;

import jakarta.ws.rs.POST;

import jakarta.ws.rs.PUT;

import jakarta.ws.rs.Path;

import jakarta.ws.rs.PathParam;

import jakarta.ws.rs.Produces;

import jakarta.ws.rs.core.MediaType;

import jakarta.ws.rs.core.Response;

import java.util.List;

import java.util.UUID;

@Path("/api")

@Consumes(MediaType.APPLICATION_JSON)

@Produces(MediaType.APPLICATION_JSON)

public class EventLogisticsResource {

    private final EventLogisticsService service;

    public EventLogisticsResource(EventLogisticsService service) { this.service = service; }

    @GET @Path("/event-people")

    public List<PersonResponse> people() { return service.people(); }

    @POST @Path("/event-people")

    public PersonResponse createPerson(@Valid PersonInput input) { return service.savePerson(null, input); }

    @PUT @Path("/event-people/{id}")

    public PersonResponse updatePerson(@PathParam("id") UUID id, @Valid PersonInput input) { return service.savePerson(id, input); }

    @DELETE @Path("/event-people/{id}")

    public Response deletePerson(@PathParam("id") UUID id) {

        service.deletePerson(id);

        return Response.noContent().build();

    }

    @GET @Path("/event-people/accounts")

    public List<AccountOption> accounts() { return service.accounts(); }

    @GET @Path("/events/{eventId}/attendees")

    public List<AttendeeResponse> attendees(@PathParam("eventId") UUID eventId) { return service.attendees(eventId); }

    @POST @Path("/events/{eventId}/attendees")

    public AttendeeResponse createAttendee(@PathParam("eventId") UUID eventId, @Valid AttendeeInput input) {

        return service.saveAttendee(eventId, null, input);

    }

    @PUT @Path("/events/{eventId}/attendees/{id}")

    public AttendeeResponse updateAttendee(@PathParam("eventId") UUID eventId, @PathParam("id") UUID id, @Valid AttendeeInput input) {

        return service.saveAttendee(eventId, id, input);

    }

    @DELETE @Path("/events/{eventId}/attendees/{id}")

    public Response deleteAttendee(@PathParam("eventId") UUID eventId, @PathParam("id") UUID id) {

        service.deleteAttendee(eventId, id);

        return Response.noContent().build();

    }

    @GET @Path("/events/{eventId}/timeline")

    public List<TimelineResponse> timeline(@PathParam("eventId") UUID eventId) { return service.timeline(eventId); }

    @GET @Path("/events/{eventId}/catering")

    public CateringSettings catering(@PathParam("eventId") UUID eventId) { return service.cateringSettings(eventId); }

    @PUT @Path("/events/{eventId}/catering")

    public CateringSettings saveCatering(@PathParam("eventId") UUID eventId, @Valid CateringSettings settings) {

        return service.saveCateringSettings(eventId, settings);

    }

    @POST @Path("/events/{eventId}/timeline")

    public TimelineResponse createTimeline(@PathParam("eventId") UUID eventId, @Valid TimelineInput input) {

        return service.saveTimeline(eventId, null, input);

    }

    @PUT @Path("/events/{eventId}/timeline/{id}")

    public TimelineResponse updateTimeline(@PathParam("eventId") UUID eventId, @PathParam("id") UUID id, @Valid TimelineInput input) {

        return service.saveTimeline(eventId, id, input);

    }

    @DELETE @Path("/events/{eventId}/timeline/{id}")

    public Response deleteTimeline(@PathParam("eventId") UUID eventId, @PathParam("id") UUID id) {

        service.deleteTimeline(eventId, id);

        return Response.noContent().build();

    }

}


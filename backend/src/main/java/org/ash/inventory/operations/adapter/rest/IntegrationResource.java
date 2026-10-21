package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.integration.api.IntegrationFeed;
import org.ash.inventory.operations.internal.security.ActorService;

import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.*;

/** Explicit admin-only integration feed: event payloads may contain private inventory facts. */
@Path("/api/integration/consumers") @Consumes(MediaType.APPLICATION_JSON) @Produces(MediaType.APPLICATION_JSON)
public class IntegrationResource {
    @Inject ActorService actors;
    @Inject IntegrationFeed feed;
    @PUT @Path("/{consumer}") public void register(@PathParam("consumer")String consumer,IntegrationFeed.Registration input){actors.requireAdmin();feed.register(consumer,input);}
    @POST @Path("/{consumer}/poll") public IntegrationFeed.Batch poll(@PathParam("consumer")String consumer,@QueryParam("limit")@DefaultValue("50")int limit){actors.requireAdmin();return feed.poll(consumer,limit);}
    @POST @Path("/{consumer}/ack") public void acknowledge(@PathParam("consumer")String consumer,IntegrationFeed.Receipt receipt){actors.requireAdmin();feed.acknowledge(consumer,receipt);}
    @POST @Path("/{consumer}/dead-letters/{event}/retry") public void retry(@PathParam("consumer")String consumer,@PathParam("event")UUID event){actors.requireAdmin();feed.retry(consumer,event);}
    @DELETE @Path("/{consumer}") public void remove(@PathParam("consumer")String consumer){actors.requireAdmin();feed.remove(consumer);}
    @GET @Path("/{consumer}/dead-letters") public List<UUID> deadLetters(@PathParam("consumer")String consumer,@QueryParam("limit")@DefaultValue("50")int limit){actors.requireAdmin();return feed.deadLetters(consumer,limit);}
    @GET @Path("/{consumer}/status") public Map<String,Long> status(@PathParam("consumer")String consumer){actors.requireAdmin();return feed.status(consumer);}
}

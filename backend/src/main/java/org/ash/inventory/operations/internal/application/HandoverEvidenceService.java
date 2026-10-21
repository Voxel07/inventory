package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.media.MediaService;
import org.ash.inventory.operations.internal.model.CustodyHandover;
import org.ash.inventory.operations.internal.model.HandoverEvidence;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;

@ApplicationScoped @Transactional
public class HandoverEvidenceService {
    @Inject EntityManager em;
    @Inject ActorService actors;
    @Inject OrderService orders;
    @Inject MediaService media;
    @Inject PrivacyProjectionService privacy;
    @Inject DomainEventService events;
    @Inject com.fasterxml.jackson.databind.ObjectMapper json;
    public record Input(@NotNull UUID commandId, boolean conditionConfirmed,
            @NotBlank @Size(max=2000) String conditionNotes, @Size(max=1024) String acknowledgementObjectKey) {}
    public record Evidence(UUID id, UUID recordedById, Instant recordedAt, boolean conditionConfirmed, String conditionNotes, String acknowledgementObjectKey) {}
    public record Handover(UUID id, String code, String type, Instant occurredAt, String collector, List<Evidence> evidence) {}

    public List<Handover> list(UUID orderId, int page, int size) {
        var order = required(InventoryOrder.class, orderId); orders.assertCanView(order);
        if (privacy.denied(orderId)) throw ApiException.notFound("Order not found");
        if (page < 0 || page > 100000 || size < 1 || size > 100) throw ApiException.badRequest("Invalid page bounds");
        var handovers = em.createQuery("from CustodyHandover h where h.order.id = :order order by h.occurredAt desc, h.id", CustodyHandover.class)
                .setParameter("order", orderId).setFirstResult(page * size).setMaxResults(size).getResultList();
        if (handovers.isEmpty()) return List.of();
        var evidence = em.createQuery("from HandoverEvidence e where e.handover in :handovers order by e.createdAt, e.id", HandoverEvidence.class)
                .setParameter("handovers", handovers).getResultList();
        return handovers.stream().map(h -> new Handover(h.id, h.handoverCode, h.type.name(), h.occurredAt, h.collectorName,
                evidence.stream().filter(e -> e.handover.id.equals(h.id)).map(this::view).toList())).toList();
    }
    public Evidence record(UUID id, Input input) {
        actors.requireWarehouse(); var actor = actors.current();
        var handover = required(CustodyHandover.class, id); orders.assertCanView(handover.order);
        em.lock(handover,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if (privacy.denied(handover.order.id)) throw ApiException.notFound("Handover not found");
        var prior = em.createQuery("from HandoverEvidence e where e.commandId = :command", HandoverEvidence.class)
                .setParameter("command", input.commandId()).getResultStream().findFirst().orElse(null);
        if (prior != null) {
            if (!prior.handover.id.equals(id) || !prior.recordedBy.id.equals(actor.id) || !prior.inputHash.equals(fingerprint(input)))
                throw ApiException.conflict("Command belongs to different evidence");
            return view(prior);
        }
        var value = new HandoverEvidence(); value.handover = handover; value.recordedBy = actor;
        value.commandId = input.commandId(); value.conditionConfirmed = input.conditionConfirmed(); value.conditionNotes = input.conditionNotes().trim();
        value.inputHash=fingerprint(input);
        em.persist(value); em.flush();
        if (input.acknowledgementObjectKey() != null && !input.acknowledgementObjectKey().isBlank())
            value.acknowledgementObjectKey = media.attachToHandover(input.acknowledgementObjectKey(), handover.id);
        events.record("order.handover_evidence", "order", handover.order.id, actor.id, input.commandId(), Map.of("handoverId", id));
        return view(value);
    }
    private Evidence view(HandoverEvidence e) { return new Evidence(e.id, e.recordedBy.id, e.createdAt, e.conditionConfirmed, e.conditionNotes, e.acknowledgementObjectKey); }
    private String fingerprint(Input input) {
        try { return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(input))); }
        catch(java.security.NoSuchAlgorithmException | com.fasterxml.jackson.core.JsonProcessingException exception) { throw new IllegalStateException(exception); }
    }
    private <T> T required(Class<T> type, UUID id) { var value = em.find(type, id); if (value == null) throw ApiException.notFound("Record not found"); return value; }
}

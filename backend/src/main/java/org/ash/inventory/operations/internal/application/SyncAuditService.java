package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.model.SyncCommandAudit;
import org.ash.inventory.operations.internal.persistence.SyncAuditOrm;
import org.ash.inventory.platform.api.ApiException;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class SyncAuditService {
    private final SyncAuditOrm orm;
    private final ObjectMapper objectMapper;

    public SyncAuditService(SyncAuditOrm orm, ObjectMapper objectMapper) {
        this.orm = orm;
        this.objectMapper = objectMapper;
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public SyncCommandAudit existing(UUID commandId) { return orm.find(commandId); }

    @Transactional
    public void record(ApiModels.SyncAction action, UUID actorId, String status, Object result, String error) {
        var audit = orm.findLocked(action.idempotencyKey());
        if (audit == null) {
            audit = new SyncCommandAudit();
            audit.commandId = action.idempotencyKey();
            audit.supersedes = action.supersedes();
            if (action.supersedes() != null) {
                var original = orm.find(action.supersedes());
                audit.resolutionRoot = original.resolutionRoot == null ? original.commandId : original.resolutionRoot;
            }
            audit.resolutionNote = action.resolutionNote();
            audit.user = orm.user(actorId);
            if (audit.user == null) throw ApiException.notFound("Sync actor not found");
            audit.operationType = action.type();
            audit.payload = new LinkedHashMap<>(action.payload());
            audit.localTimestamp = action.localTimestamp();
            audit.deviceId = action.deviceId();
            audit.syncStatus = status;
            audit.retryCount = action.retryCount() == null ? 1 : Math.max(1, action.retryCount());
            audit.serverResult = result == null ? null
                    : objectMapper.convertValue(result, new TypeReference<Map<String, Object>>() {});
            audit.conflictMessage = error;
            orm.persist(audit);
            return;
        }
        // Terminal results and original evidence are immutable. Corrections have new command IDs.
    }

    @Transactional
    public List<SyncCommandAudit> list(String status, int page, int size) {
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid page bounds");
        return orm.list(status, Math.multiplyExact(page, size), size);
    }
}

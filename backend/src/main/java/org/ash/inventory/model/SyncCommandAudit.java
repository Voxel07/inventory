package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "sync_command_audit")
public class SyncCommandAudit extends BaseEntity {
    @Column(name = "command_id", nullable = false, unique = true) public UUID commandId;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id") public UserAccount user;
    @Column(name = "device_id") public String deviceId;
    @Column(name = "operation_type", nullable = false) public String operationType;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false) public Map<String, Object> payload = new LinkedHashMap<>();
    @Column(name = "local_timestamp") public Instant localTimestamp;
    @Column(name = "sync_status", nullable = false) public String syncStatus;
    @Column(name = "retry_count", nullable = false) public int retryCount;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "server_result", columnDefinition = "jsonb") public Map<String, Object> serverResult;
    @Column(name = "conflict_message", length = 2000) public String conflictMessage;
}

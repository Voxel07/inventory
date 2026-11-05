package org.ash.inventory.operations.internal.model;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.ash.inventory.platform.persistence.BaseEntity;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.UUID;

/** Uploaded work and its checkpoint share the transaction with each imported row. */
@Entity
@org.hibernate.annotations.DynamicUpdate
@Table(name = "csv_import_jobs")
public class CsvImportJob extends BaseEntity {
    @Column(name = "requested_by", nullable = false) public UUID requestedBy;
    @Column(name = "authenticated_by", nullable = false) public UUID authenticatedBy;
    @Column(name = "access_revision", nullable = false) public long accessRevision;
    @Column(name = "command_id", nullable = false, unique = true) public UUID commandId;
    @Column(nullable = false, length = 255) public String filename;
    @Column(nullable = false, length = 16) public String status = "queued";
    @Column(nullable = false) public int cursor;
    @Column(name = "total_rows", nullable = false) public int totalRows;
    @Column(name = "total_steps", nullable = false) public int totalSteps;
    @Column(name = "processed_rows", nullable = false) public int processedRows;
    @Column(nullable = false, length = 64) public String timezone;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false, columnDefinition = "jsonb") public ArrayNode work;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false, columnDefinition = "jsonb") public ObjectNode context;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false, columnDefinition = "jsonb") public ObjectNode result;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "authorization_context", nullable = false, columnDefinition = "jsonb") public ObjectNode authorization;
}

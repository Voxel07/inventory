package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Index;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Immutable S3 object metadata for damage, repair, asset, maintenance and generated documents. */
@Entity
@Table(name = "media_attachments", indexes =
        @Index(name = "ix_media_owner", columnList = "owner_type,owner_id"))
public class MediaAttachment extends BaseEntity {
    @Column(name = "owner_type", nullable = false) public String ownerType;
    @Column(name = "owner_id", nullable = false) public UUID ownerId;
    @Column(nullable = false) public String kind;
    @Column(name = "original_filename", nullable = false) public String originalFilename;
    @Column(name = "mime_type", nullable = false) public String mimeType;
    @Column(name = "object_storage_key", nullable = false, unique = true) public String objectStorageKey;
    @Column(name = "file_size", nullable = false) public long fileSize;
    @Column(nullable = false, length = 128) public String checksum;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "uploaded_by") public UserAccount uploadedBy;
    @Column(name = "retention_until") public LocalDate retentionUntil;
    @Column(name = "deleted_at") public Instant deletedAt;
}

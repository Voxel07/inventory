package org.ash.inventory.operations.internal.media;

import org.ash.inventory.blobs.api.BlobStore.StoredDocument;

import org.ash.inventory.blobs.api.BlobStore;

import org.ash.inventory.operations.internal.application.InventoryMediaService;

import org.ash.inventory.operations.internal.application.MediaCleanupService;

import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;

import jakarta.inject.Inject;

import jakarta.transaction.*;

import java.util.UUID;

import java.util.HexFormat;

import java.util.regex.Pattern;

import java.io.OutputStream;

import java.io.IOException;

import java.security.MessageDigest;

import java.security.NoSuchAlgorithmException;

/** Resource attachment orchestration. Opaque blob storage has no business/authorization dependency. */

@ApplicationScoped

public class MediaService {

    private static final org.jboss.logging.Logger LOG=org.jboss.logging.Logger.getLogger(MediaService.class);

    private static final Pattern STAGED_UPLOAD=Pattern.compile("[0-9]{4}-[0-9a-f-]{36}-.+");

    @Inject BlobStore blobs;

    @Inject org.ash.inventory.operations.internal.application.InventoryMediaService permissions;

    @Inject TransactionSynchronizationRegistry transactions;

    @Inject org.ash.inventory.operations.internal.application.MediaCleanupService cleanup;

    @Transactional(Transactional.TxType.MANDATORY)
    public BlobStore.StoredMedia upload(String original,String type,java.nio.file.Path source) {
        String key=blobs.allocateKey(original);cleanup.protectDestination(key);
        var stored=blobs.put(key,type,source);permissions.register(key);cleanup.retain(key);deleteUnlessCommitted(key);return stored;
    }
    public String attachToItem(String reference, UUID itemId) {

        return attachToRecord(reference, itemId, "items");

    }

    public String attachToLocation(String reference, UUID locationId) {

        return attachToRecord(reference, locationId, "locations");

    }

    public String attachToAssembly(String reference, UUID assemblyId) {

        return attachToRecord(reference, assemblyId, "assemblies");

    }

    public String attachToReturnSubmission(String reference, UUID returnSubmissionId) {

        return attachToRecord(reference, returnSubmissionId, "returns");

    }

    public String attachToMaintenance(String reference, UUID maintenanceId) {

        return attachToRecord(reference, maintenanceId, "maintenance");

    }

    public String attachToHandover(String reference, UUID handoverId) { return attachToRecord(reference, handoverId, "handovers"); }

    public StoredDocument inspectVendorDocument(String reference) {

        try {

            String source = blobs.mediaReference(reference);

            permissions.requireStaged(source);

            if (!STAGED_UPLOAD.matcher(source).matches()) {

                throw ApiException.badRequest("Only staged uploads can be attached as vendor documents");

            }

            var content = blobs.read(source);

            String checksum;

            try (var stream = content.stream()) {

                var digest = MessageDigest.getInstance("SHA-256");

                stream.transferTo(new java.security.DigestOutputStream(OutputStream.nullOutputStream(), digest));

                checksum = HexFormat.of().formatHex(digest.digest());

            } catch (NoSuchAlgorithmException exception) {

                throw new IllegalStateException("SHA-256 is unavailable", exception);

            }

            return new StoredDocument(source, content.contentType(), content.contentLength(), checksum);

        } catch (IOException failure) { throw new ApiException(500,"Could not inspect media"); }

    }

    public StoredDocument attachToVendorDocument(StoredDocument inspected, UUID documentId, String originalFilename) {

        String source = inspected.key();

        permissions.requireStaged(source);

        String safeName = (originalFilename == null ? "document" : originalFilename)

                .replaceAll("[^a-zA-Z0-9._-]", "_");

        String destination = "vendor-documents/" + documentId + "/" + safeName;

        cleanup.protectDestination(destination);

        blobs.copy(source, destination);

        permissions.attach(source, destination, "vendor-documents", documentId);

        cleanup.attached(source,destination);

        transactions.registerInterposedSynchronization(new Synchronization() {

            public void beforeCompletion() {}

            public void afterCompletion(int status) {

                try { blobs.delete(status == Status.STATUS_COMMITTED ? source : destination); }

                catch (RuntimeException exception) { LOG.warn("Could not clean up vendor document object", exception); }

            }

        });

        return new StoredDocument(destination, inspected.contentType(), inspected.contentLength(), inspected.checksum());

    }

    /** An upload whose registry row is not committed would never be purged; remove its object instead. */

    public void deleteUnlessCommitted(String key) {

        transactions.registerInterposedSynchronization(new Synchronization() {

            public void beforeCompletion() {}

            public void afterCompletion(int status) {

                if (status == Status.STATUS_COMMITTED) return;

                try { blobs.delete(key); }

                catch (RuntimeException exception) { LOG.warn("Could not delete uncommitted upload", exception); }

            }

        });

    }

    @Transactional
    public void deleteStaged(String reference) {
        String key=blobs.mediaReference(reference);
        // Authorize first: attached or foreign objects stay indistinguishable from missing ones (404).
        permissions.requireStaged(key);
        if(!STAGED_UPLOAD.matcher(key).matches())throw ApiException.badRequest("Only staged uploads can be deleted");
        permissions.forgetStaged(key);cleanup.deleteAfterCommit(key);
    }

    public void deleteAfterCommit(String reference) {

        String key = blobs.mediaReference(reference);

        permissions.forget(key);

        cleanup.deleteAfterCommit(key);

        transactions.registerInterposedSynchronization(new Synchronization() {

            public void beforeCompletion() {}

            public void afterCompletion(int status) {

                if (status != Status.STATUS_COMMITTED) return;

                try { blobs.delete(key); }

                catch (RuntimeException exception) { LOG.warn("Could not delete superseded media object", exception); }

            }

        });

    }

    private String attachToRecord(String reference, UUID recordId, String directory) {

        String key = blobs.mediaReference(reference);

        if (!STAGED_UPLOAD.matcher(key).matches()) { permissions.requireAttached(key, directory, recordId); return key; }

        permissions.requireStaged(key);

        String extension = key.contains(".") ? key.substring(key.lastIndexOf('.')) : ".bin";

        String destination = directory + "/" + UUID.randomUUID() + "/" + recordId + extension;

        cleanup.protectDestination(destination);

        blobs.copy(key, destination);

        permissions.attach(key, destination, directory, recordId);

        cleanup.attached(key,destination);

        transactions.registerInterposedSynchronization(new Synchronization() {

            public void beforeCompletion() {}

            public void afterCompletion(int status) {

                try { blobs.delete(status == Status.STATUS_COMMITTED ? key : destination); }

                catch (RuntimeException exception) { LOG.warn("Could not clean up item image object", exception); }

            }

        });

        return destination;

    }

}


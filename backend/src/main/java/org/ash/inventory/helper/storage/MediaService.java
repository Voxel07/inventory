package org.ash.inventory.helper.storage;

import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Status;
import jakarta.transaction.Synchronization;
import jakarta.transaction.TransactionSynchronizationRegistry;
import org.ash.inventory.resource.ApiException;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CopyObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.ZoneOffset;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

@ApplicationScoped
public class MediaService {
    private static final org.jboss.logging.Logger LOG = org.jboss.logging.Logger.getLogger(MediaService.class);
    private static final Pattern STAGED_IMAGE = Pattern.compile("[0-9]{4}-[0-9a-f-]{36}-image\\.webp");
    private static final Pattern STAGED_UPLOAD = Pattern.compile("[0-9]{4}-[0-9a-f-]{36}-.+");

    private final TransactionSynchronizationRegistry transactions;
    private final String mode;
    private final String localDirectory;
    private final String endpoint;
    private final String bucket;
    private final String region;
    private final Optional<String> accessKey;
    private final Optional<String> secretKey;
    private volatile S3Client s3Client;

    public MediaService(TransactionSynchronizationRegistry transactions,
            @ConfigProperty(name = "inventory.media.mode") String mode,
            @ConfigProperty(name = "inventory.media.local-directory") String localDirectory,
            @ConfigProperty(name = "inventory.media.s3.endpoint") String endpoint,
            @ConfigProperty(name = "inventory.media.s3.bucket") String bucket,
            @ConfigProperty(name = "inventory.media.s3.region") String region,
            @ConfigProperty(name = "inventory.media.s3.access-key") Optional<String> accessKey,
            @ConfigProperty(name = "inventory.media.s3.secret-key") Optional<String> secretKey) {
        this.transactions = transactions;
        this.mode = mode;
        this.localDirectory = localDirectory;
        this.endpoint = endpoint;
        this.bucket = bucket;
        this.region = region;
        this.accessKey = accessKey;
        this.secretKey = secretKey;
    }

    public record StoredMedia(String key, String url) {}
    public record MediaContent(InputStream stream, String contentType, long contentLength) {}
    public record StoredDocument(String key, String contentType, long contentLength, String checksum) {}

    public StoredMedia store(String originalName, String contentType, Path source) {
        String key = newKey(originalName);
        try {
            if (isS3()) {
                s3().putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build(),
                        RequestBody.fromFile(source));
            } else {
                putLocal(key, source);
            }
            return new StoredMedia(key, null);
        } catch (IOException exception) {
            throw new ApiException(500, "Could not store media");
        } catch (SdkException exception) {
            throw storageFailure("store", exception);
        }
    }

    /** Convenience overload for small in-memory callers; HTTP uploads use the Path overload. */
    public StoredMedia store(String originalName, String contentType, byte[] bytes) {
        String key = newKey(originalName);
        if (isS3()) {
            try {
                s3().putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build(),
                        RequestBody.fromBytes(bytes));
            } catch (SdkException exception) {
                throw storageFailure("store", exception);
            }
        } else {
            try (var input = new ByteArrayInputStream(bytes)) {
                putLocal(key, input);
            } catch (IOException exception) {
                throw new ApiException(500, "Could not store media");
            }
        }
        return new StoredMedia(key, null);
    }

    public MediaContent read(String key) {
        validateKey(key);
        if (isS3()) {
            try {
                ResponseInputStream<GetObjectResponse> stream = s3().getObject(
                        GetObjectRequest.builder().bucket(bucket).key(key).build());
                String responseType = stream.response().contentType();
                return new MediaContent(stream, responseType == null ? contentType(key) : responseType,
                        stream.response().contentLength());
            } catch (S3Exception exception) {
                if (exception.statusCode() == 404) throw ApiException.notFound("Media not found");
                throw storageFailure("read", exception);
            } catch (SdkException exception) {
                throw storageFailure("read", exception);
            }
        }
        try {
            Path file = localFile(key);
            return new MediaContent(Files.newInputStream(file), contentType(key), Files.size(file));
        } catch (IOException exception) {
            throw new ApiException(500, "Could not read media");
        }
    }

    public String mediaReference(String value) {
        if (value == null) return null;
        validateKey(value);
        return value;
    }

    public String attachToItem(String reference, UUID itemId) {
        return attachToRecord(reference, itemId, "items");
    }

    public String attachToAssembly(String reference, UUID assemblyId) {
        return attachToRecord(reference, assemblyId, "assemblies");
    }

    public String attachToReturnSubmission(String reference, UUID returnSubmissionId) {
        return attachToRecord(reference, returnSubmissionId, "returns");
    }

    public StoredDocument attachToVendorDocument(String reference, UUID documentId, String originalFilename) {
        String source = mediaReference(reference);
        if (!STAGED_UPLOAD.matcher(source).matches()) {
            throw ApiException.badRequest("Only staged uploads can be attached as vendor documents");
        }
        var content = read(source);
        String checksum;
        try (var stream = content.stream()) {
            var digest = MessageDigest.getInstance("SHA-256");
            stream.transferTo(new java.security.DigestOutputStream(OutputStream.nullOutputStream(), digest));
            checksum = HexFormat.of().formatHex(digest.digest());
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new ApiException(500, "Could not inspect vendor document");
        }
        String safeName = (originalFilename == null ? "document" : originalFilename)
                .replaceAll("[^a-zA-Z0-9._-]", "_");
        String destination = "vendor-documents/" + documentId + "/" + safeName;
        copy(source, destination);
        transactions.registerInterposedSynchronization(new Synchronization() {
            public void beforeCompletion() {}
            public void afterCompletion(int status) {
                try { delete(status == Status.STATUS_COMMITTED ? source : destination); }
                catch (RuntimeException exception) { LOG.warn("Could not clean up vendor document object", exception); }
            }
        });
        return new StoredDocument(destination, content.contentType(), content.contentLength(), checksum);
    }

    public void deleteStaged(String reference) {
        String key = mediaReference(reference);
        if (!STAGED_IMAGE.matcher(key).matches()) throw ApiException.badRequest("Only staged images can be deleted");
        delete(key);
    }

    public void deleteAfterCommit(String reference) {
        String key = mediaReference(reference);
        transactions.registerInterposedSynchronization(new Synchronization() {
            public void beforeCompletion() {}
            public void afterCompletion(int status) {
                if (status != Status.STATUS_COMMITTED) return;
                try { delete(key); }
                catch (RuntimeException exception) { LOG.warn("Could not delete superseded media object", exception); }
            }
        });
    }

    private String attachToRecord(String reference, UUID recordId, String directory) {
        String key = mediaReference(reference);
        if (!STAGED_IMAGE.matcher(key).matches()) return key;
        String destination = directory + "/" + UUID.randomUUID() + "/" + recordId + ".webp";
        copy(key, destination);
        transactions.registerInterposedSynchronization(new Synchronization() {
            public void beforeCompletion() {}
            public void afterCompletion(int status) {
                try { delete(status == Status.STATUS_COMMITTED ? key : destination); }
                catch (RuntimeException exception) { LOG.warn("Could not clean up item image object", exception); }
            }
        });
        return destination;
    }

    private void copy(String source, String destination) {
        validateKey(source);
        validateKey(destination);
        if (isS3()) {
            try {
                s3().copyObject(CopyObjectRequest.builder()
                        .destinationBucket(bucket).destinationKey(destination)
                        .sourceBucket(bucket).sourceKey(source).build());
            } catch (SdkException exception) {
                throw storageFailure("copy", exception);
            }
            return;
        }
        try {
            Path destinationFile = resolvedLocalPath(destination);
            Files.createDirectories(destinationFile.getParent());
            Files.copy(localFile(source), destinationFile, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException exception) {
            throw new ApiException(500, "Could not copy media");
        }
    }

    private void delete(String key) {
        validateKey(key);
        if (isS3()) {
            try {
                s3().deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
            } catch (SdkException exception) {
                throw storageFailure("delete", exception);
            }
        } else {
            try { Files.deleteIfExists(resolvedLocalPath(key)); }
            catch (IOException exception) { throw new ApiException(500, "Could not delete media"); }
        }
    }

    private Path localFile(String key) {
        Path file = resolvedLocalPath(key);
        if (!Files.isRegularFile(file)) throw ApiException.notFound("Media not found");
        return file;
    }

    private Path resolvedLocalPath(String key) {
        Path root = Path.of(localDirectory).toAbsolutePath().normalize();
        Path file = root.resolve(key).normalize();
        if (!file.startsWith(root)) throw ApiException.badRequest("Invalid media key");
        return file;
    }

    private void putLocal(String key, Path source) throws IOException {
        Path file = resolvedLocalPath(key);
        Files.createDirectories(file.getParent());
        Files.copy(source, file, StandardCopyOption.REPLACE_EXISTING);
    }

    private void putLocal(String key, InputStream source) throws IOException {
        Path file = resolvedLocalPath(key);
        Files.createDirectories(file.getParent());
        Files.copy(source, file, StandardCopyOption.REPLACE_EXISTING);
    }

    private String newKey(String originalName) {
        String safeName = (originalName == null ? "upload" : originalName).replaceAll("[^a-zA-Z0-9._-]", "_");
        return Instant.now().atZone(ZoneOffset.UTC).getYear() + "-" + UUID.randomUUID() + "-" + safeName;
    }

    private void validateKey(String key) {
        if (key == null || key.isBlank() || key.startsWith("/") || key.contains("\\")
                || java.util.Arrays.stream(key.split("/", -1))
                        .anyMatch(part -> part.isBlank() || part.equals(".") || part.equals(".."))) {
            throw ApiException.badRequest("Invalid media key");
        }
    }

    private String contentType(String key) {
        String lower = key.toLowerCase(java.util.Locale.ROOT);
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        return "application/octet-stream";
    }

    private boolean isS3() {
        return "s3".equalsIgnoreCase(mode);
    }

    private S3Client s3() {
        S3Client client = s3Client;
        if (client != null) return client;
        synchronized (this) {
            if (s3Client != null) return s3Client;
            String configuredAccessKey = accessKey.orElse("");
            String configuredSecretKey = secretKey.orElse("");
            if (configuredAccessKey.isBlank() || configuredSecretKey.isBlank()) {
                throw new ApiException(503, "S3 media storage is not configured");
            }
            s3Client = S3Client.builder()
                    .endpointOverride(URI.create(endpoint))
                    .region(Region.of(region))
                    .httpClientBuilder(UrlConnectionHttpClient.builder())
                    .credentialsProvider(StaticCredentialsProvider.create(
                            AwsBasicCredentials.create(configuredAccessKey, configuredSecretKey)))
                    .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                    .build();
            return s3Client;
        }
    }

    private ApiException storageFailure(String operation, SdkException cause) {
        LOG.warnf(cause, "Object storage %s failed", operation);
        return new ApiException(502, "Object storage is unavailable");
    }

    @PreDestroy
    void closeClient() {
        S3Client client = s3Client;
        if (client != null) client.close();
    }
}

package org.ash.inventory.helper.storage;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Status;
import jakarta.transaction.Synchronization;
import jakarta.transaction.TransactionSynchronizationRegistry;
import org.ash.inventory.resource.ApiException;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class MediaService {
    @Inject TransactionSynchronizationRegistry transactions;
    private static final org.jboss.logging.Logger LOG = org.jboss.logging.Logger.getLogger(MediaService.class);
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(10)).build();
    @ConfigProperty(name = "inventory.media.mode") String mode;
    @ConfigProperty(name = "inventory.media.local-directory") String localDirectory;
    @ConfigProperty(name = "inventory.media.s3.endpoint") String endpoint;
    @ConfigProperty(name = "inventory.media.s3.bucket") String bucket;
    @ConfigProperty(name = "inventory.media.s3.region") String region;
    @ConfigProperty(name = "inventory.media.s3.access-key") Optional<String> accessKey;
    @ConfigProperty(name = "inventory.media.s3.secret-key") Optional<String> secretKey;

    public record StoredMedia(String key, String url) {}
    public record MediaContent(byte[] bytes, String contentType) {}

    public StoredMedia store(String originalName, String contentType, byte[] bytes) {
        String safeName = (originalName == null ? "upload" : originalName).replaceAll("[^a-zA-Z0-9._-]", "_");
        String key = Instant.now().atZone(ZoneOffset.UTC).getYear() + "-" + UUID.randomUUID() + "-" + safeName;
        if ("s3".equalsIgnoreCase(mode)) putS3(key, contentType, bytes);
        else putLocal(key, bytes);
        return new StoredMedia(key, null);
    }

    public MediaContent read(String key) {
        validateKey(key);
        if ("s3".equalsIgnoreCase(mode)) {
            var response = requestS3("GET", key, "application/octet-stream", new byte[0]);
            return new MediaContent(response.body(), response.headers().firstValue("Content-Type").orElse(contentType(key)));
        }
        return new MediaContent(readLocal(key), contentType(key));
    }

    /** Accept only canonical object keys stored by this application. */
    public String mediaReference(String value) {
        if (value == null) return null;
        validateKey(value);
        return value;
    }

    /** Promote newly converted uploads once the database has assigned the item's ID. */
    public String attachToItem(String reference, UUID itemId) {
        return attachToRecord(reference, itemId, "items");
    }

    public String attachToAssembly(String reference, UUID assemblyId) {
        return attachToRecord(reference, assemblyId, "assemblies");
    }

    private String attachToRecord(String reference, UUID recordId, String directory) {
        String key = mediaReference(reference);
        if (!key.matches("[0-9]{4}-[0-9a-f-]{36}-image\\.webp")) return key;
        String destination = directory + "/" + UUID.randomUUID() + "/" + recordId + ".webp";
        var content = read(key);
        if ("s3".equalsIgnoreCase(mode)) putS3(destination, "image/webp", content.bytes());
        else putLocal(destination, content.bytes());
        // Keep the source available until commit; a failed item save can safely be retried.
        transactions.registerInterposedSynchronization(new Synchronization() {
            public void beforeCompletion() {}
            public void afterCompletion(int status) {
                try { delete(status == Status.STATUS_COMMITTED ? key : destination); }
                catch (RuntimeException exception) { LOG.warn("Could not clean up item image object", exception); }
            }
        });
        return destination;
    }

    private void delete(String key) {
        validateKey(key);
        if ("s3".equalsIgnoreCase(mode)) requestS3("DELETE", key, "application/octet-stream", new byte[0]);
        else {
            try { Files.deleteIfExists(Path.of(localDirectory).toAbsolutePath().normalize().resolve(key)); }
            catch (IOException exception) { throw new ApiException(500, "Could not delete media"); }
        }
    }

    private void validateKey(String key) {
        if (key == null || key.isBlank() || key.startsWith("/") || key.contains("\\")
                || java.util.Arrays.stream(key.split("/", -1)).anyMatch(part -> part.isBlank() || part.equals(".") || part.equals(".."))) {
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

    public byte[] readLocal(String key) {
        validateKey(key);
        if ("s3".equalsIgnoreCase(mode)) throw ApiException.notFound("Media is served by object storage");
        try {
            Path root = Path.of(localDirectory).toAbsolutePath().normalize();
            Path file = root.resolve(key).normalize();
            if (!file.startsWith(root) || !Files.isRegularFile(file)) throw ApiException.notFound("Media not found");
            return Files.readAllBytes(file);
        } catch (IOException exception) { throw new ApiException(500, "Could not read media"); }
    }

    private void putLocal(String key, byte[] bytes) {
        try {
            Path root = Path.of(localDirectory).toAbsolutePath().normalize();
            Path file = root.resolve(key).normalize();
            if (!file.startsWith(root)) throw ApiException.badRequest("Invalid media key");
            Files.createDirectories(file.getParent());
            Files.write(file, bytes);
        } catch (IOException exception) { throw new ApiException(500, "Could not store media"); }
    }

    private void putS3(String key, String contentType, byte[] bytes) {
        requestS3("PUT", key, contentType, bytes);
    }

    private HttpResponse<byte[]> requestS3(String method, String key, String contentType, byte[] bytes) {
        validateKey(key);
        String configuredAccessKey = accessKey.orElse("");
        String configuredSecretKey = secretKey.orElse("");
        if (configuredAccessKey.isBlank() || configuredSecretKey.isBlank()) throw new ApiException(503, "S3 media storage is not configured");
        try {
            var now = Instant.now();
            String amzDate = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(now);
            String date = amzDate.substring(0, 8);
            String payloadHash = sha256Hex(bytes);
            URI uri = URI.create(endpoint.replaceAll("/$", "") + "/" + bucket + "/" + encodePath(key));
            String canonicalUri = uri.getRawPath();
            String host = uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "");
            String canonicalHeaders = "content-type:" + contentType + "\n" + "host:" + host + "\n" + "x-amz-content-sha256:" + payloadHash + "\n" + "x-amz-date:" + amzDate + "\n";
            String signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
            String canonicalRequest = method + "\n" + canonicalUri + "\n\n" + canonicalHeaders + "\n" + signedHeaders + "\n" + payloadHash;
            String scope = date + "/" + region + "/s3/aws4_request";
            String stringToSign = "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + sha256Hex(canonicalRequest.getBytes(StandardCharsets.UTF_8));
            byte[] signingKey = hmac(hmac(hmac(hmac(("AWS4" + configuredSecretKey).getBytes(StandardCharsets.UTF_8), date), region), "s3"), "aws4_request");
            String signature = HexFormat.of().formatHex(hmac(signingKey, stringToSign));
            String authorization = "AWS4-HMAC-SHA256 Credential=" + configuredAccessKey + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
            var request = HttpRequest.newBuilder(uri).method(method, HttpRequest.BodyPublishers.ofByteArray(bytes))
                    .timeout(java.time.Duration.ofSeconds(30))
                    .header("Content-Type", contentType).header("x-amz-content-sha256", payloadHash)
                    .header("x-amz-date", amzDate).header("Authorization", authorization).build();
            var response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() == 404 && method.equals("GET")) throw ApiException.notFound("Media not found");
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new ApiException(502, "Object storage rejected " + method + " (" + response.statusCode() + ")");
            return response;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ApiException(502, "Object storage request interrupted");
        } catch (IOException exception) { throw new ApiException(502, "Object storage is unavailable"); }
    }

    private String encodePath(String path) { return java.util.Arrays.stream(path.split("/")).map(value -> URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")).collect(java.util.stream.Collectors.joining("/")); }
    private String sha256Hex(byte[] value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private byte[] hmac(byte[] key, String value) { try { var mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(key, "HmacSHA256")); return mac.doFinal(value.getBytes(StandardCharsets.UTF_8)); } catch (Exception exception) { throw new IllegalStateException(exception); } }
}

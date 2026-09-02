package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.api.ApiException;
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
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class MediaService {
    @ConfigProperty(name = "inventory.media.mode") String mode;
    @ConfigProperty(name = "inventory.media.local-directory") String localDirectory;
    @ConfigProperty(name = "inventory.media.s3.endpoint") String endpoint;
    @ConfigProperty(name = "inventory.media.s3.bucket") String bucket;
    @ConfigProperty(name = "inventory.media.s3.region") String region;
    @ConfigProperty(name = "inventory.media.s3.access-key") Optional<String> accessKey;
    @ConfigProperty(name = "inventory.media.s3.secret-key") Optional<String> secretKey;
    @ConfigProperty(name = "inventory.media.public-base-url") Optional<String> publicBaseUrl;

    public record StoredMedia(String key, String url) {}

    public StoredMedia store(String originalName, String contentType, byte[] bytes) {
        String safeName = (originalName == null ? "upload" : originalName).replaceAll("[^a-zA-Z0-9._-]", "_");
        String key = Instant.now().atZone(ZoneOffset.UTC).getYear() + "-" + UUID.randomUUID() + "-" + safeName;
        if ("s3".equalsIgnoreCase(mode)) putS3(key, contentType, bytes);
        else putLocal(key, bytes);
        return new StoredMedia(key, "s3".equalsIgnoreCase(mode) ? publicUrl(key) : null);
    }

    public byte[] readLocal(String key) {
        if ("s3".equalsIgnoreCase(mode)) throw ApiException.notFound("Media is served by object storage");
        try {
            Path root = Path.of(localDirectory).toAbsolutePath().normalize();
            Path file = root.resolve(key).normalize();
            if (!file.startsWith(root) || !Files.exists(file)) throw ApiException.notFound("Media not found");
            return Files.readAllBytes(file);
        } catch (IOException exception) { throw new ApiException(500, "Could not read media"); }
    }

    public String publicUrl(String key) {
        if (publicBaseUrl.isPresent() && !publicBaseUrl.get().isBlank()) return publicBaseUrl.get().replaceAll("/$", "") + "/" + encodePath(key);
        return endpoint.replaceAll("/$", "") + "/" + bucket + "/" + encodePath(key);
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
            String canonicalRequest = "PUT\n" + canonicalUri + "\n\n" + canonicalHeaders + "\n" + signedHeaders + "\n" + payloadHash;
            String scope = date + "/" + region + "/s3/aws4_request";
            String stringToSign = "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + sha256Hex(canonicalRequest.getBytes(StandardCharsets.UTF_8));
            byte[] signingKey = hmac(hmac(hmac(hmac(("AWS4" + configuredSecretKey).getBytes(StandardCharsets.UTF_8), date), region), "s3"), "aws4_request");
            String signature = HexFormat.of().formatHex(hmac(signingKey, stringToSign));
            String authorization = "AWS4-HMAC-SHA256 Credential=" + configuredAccessKey + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
            var request = HttpRequest.newBuilder(uri).PUT(HttpRequest.BodyPublishers.ofByteArray(bytes))
                    .header("Content-Type", contentType).header("x-amz-content-sha256", payloadHash)
                    .header("x-amz-date", amzDate).header("Authorization", authorization).build();
            var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new ApiException(502, "Object storage rejected upload (" + response.statusCode() + ")");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ApiException(502, "Object storage upload interrupted");
        } catch (IOException exception) { throw new ApiException(502, "Object storage is unavailable"); }
    }

    private String encodePath(String path) { return java.util.Arrays.stream(path.split("/")).map(value -> URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")).collect(java.util.stream.Collectors.joining("/")); }
    private String sha256Hex(byte[] value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private byte[] hmac(byte[] key, String value) { try { var mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(key, "HmacSHA256")); return mac.doFinal(value.getBytes(StandardCharsets.UTF_8)); } catch (Exception exception) { throw new IllegalStateException(exception); } }
}

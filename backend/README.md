# ASH Inventory API

Quarkus 3.39 / Java 25 REST backend for the ASH inventory application.

## Local development

Start PostgreSQL and the API from the repository root:

```bash
docker compose up postgres inventory-api
```

The API exposes:

- OpenAPI: `http://localhost:8080/q/openapi`
- Swagger UI: `http://localhost:8080/q/swagger-ui`
- Health: `http://localhost:8080/q/health`

For a local JVM run, use a Java 25 installation and Maven:

```bash
mvn quarkus:dev
```

The development profile uses an in-memory H2 database and disables the
container-based Grafana/OpenTelemetry Dev Service, so no external services are
required. Production continues to use PostgreSQL, Flyway, and the configured
OpenTelemetry endpoint.

Production requires `OIDC_ENABLED=true` and the Authentik issuer/client settings. `DEV_AUTH_ENABLED` must be `false` outside local development.

Flyway owns the PostgreSQL schema. Never edit deployed tables manually; add a migration under `src/main/resources/db/migration`.

## Backend package structure

The backend follows one dependency direction:

```text
resource -> service -> orm -> model
    |           |
    +------ helper/security
    +------ helper/storage
```

- `model` contains JPA table/relationship descriptions, defaults, lifecycle callbacks, and simple entity accessors. Models do not query or persist themselves.
- `orm` is the only persistence boundary. It owns `EntityManager`, JPQL, locking, CRUD operations, and queries that join or coordinate models.
- `resource` defines the public REST API, DTOs, response mapping, exception mapping, RBAC checks, and rate limiting.
- `service` owns transactional use cases and business rules. Services use ORM classes rather than accessing Hibernate directly.
- `helper/security` resolves the authenticated actor and implements the reusable RBAC checks used by resources.
- `helper/storage` contains local and S3-compatible media storage infrastructure.

The completed domain and event architecture is documented in [`../docs/DOMAIN_ARCHITECTURE.md`](../docs/DOMAIN_ARCHITECTURE.md). Business services append events to `domain_event_outbox` in the same transaction as aggregate changes. The outbox dispatcher provides at-least-once SSE/Redis delivery, so consumers deduplicate on `eventId`.

API throttling defaults to 300 requests per caller per 60-second window and can be configured with `API_RATE_LIMIT_REQUESTS` and `API_RATE_LIMIT_WINDOW_SECONDS`.

## Item and assembly images

The web app converts new JPEG, PNG and WebP item uploads to WebP at quality 82,
with a maximum edge length of 2048 pixels (no upscaling). Conversion applies EXIF
orientation, converts to sRGB and re-encodes pixels without the source metadata
or filename. EXIF, XMP and ICC chunks are explicitly removed from the encoded WebP. It
requires browser WebP encoding support; unsupported or invalid files fail before
upload. Map overlays continue to use the generic media uploader.

Uploads are staged until the item is saved. The API assigns the final object key
`items/<unique-image-id>/<item-id>.webp`, so multiple images have the item ID as
their filename without overwriting each other. After database commit the staged
object is deleted; rollback preserves it for retry and removes the new copy.
Failed storage cleanup is logged. Abandoned uploads and removed item images are
not automatically garbage-collected.

Media is fetched from `/api/media/<key>` using the app's authentication headers.
The API reads private Garage/S3 objects with signed requests and returns the
bytes and image content type. The bucket does not need public access; its API
credentials need object read, write and delete permissions. `S3_ENDPOINT` must
be reachable by the backend and need not be reachable by the browser.

New records store object keys. Older URLs under the configured S3 endpoint/bucket
or `MEDIA_PUBLIC_BASE_URL` are translated to keys when returned by the API. Keep
that public base configured if existing records use it. Unrelated external URLs
remain external. Existing images display in their original format; re-upload them
to apply WebP conversion, metadata removal and item-based naming.

Run `mvn test` for media storage and API regression tests. For actual browser
encoding and authenticated rendering checks, start the frontend with `bun run dev`
and open `/tests/media.browser.html`; its generated fixtures and mocked API do not
need a running backend or S3 service.

Assemblies support one optional image via `image` (object key) and `removeImage`
on create/update. Omitting these fields preserves the image on update. Assembly
uploads use `assemblies/<unique-image-id>/<assembly-id>.webp`. The nullable
`assemblies.image_object_key` column is added by the currently configured
Hibernate schema update when the backend starts.

Item and assembly forms share an image editor with drag/position controls, zoom,
original/square/landscape/portrait aspect ratios and 512/1024/2048-pixel output
limits. Cropping is applied to the stored pixels before upload, with no upscaling
and the same metadata stripping. Existing images can be edited, and item image
replacements preserve gallery order. Applying a crop stages a change in the form;
it is uploaded only when the form is saved. Cancel closes the editor without
applying its crop. Restoring discarded areas after saving requires the original
image to be uploaded again.

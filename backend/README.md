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

API throttling defaults to 300 requests per caller per 60-second window and can be configured with `API_RATE_LIMIT_REQUESTS` and `API_RATE_LIMIT_WINDOW_SECONDS`.

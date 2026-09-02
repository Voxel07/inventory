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

# ntfy setup

The main `docker-compose.yml` configures ntfy entirely through environment variables. No `server.yml` or config-file mount is needed. The API publishes to `http://ntfy` on the default Docker network; users subscribe using `INVENTORY_NOTIFICATION_NTFY_PUBLIC_URL`. The user database and message cache use persistent named volumes.

## Credentials

Generate a password hash and token without starting the stack:

```sh
docker run --rm -it binwiederhier/ntfy:v2.34.0 user hash
docker run --rm binwiederhier/ntfy:v2.34.0 token generate
```

Enter a strong service-account password when prompted. Put the outputs in `.env`:

```dotenv
NTFY_PASSWORD_HASH='PASTE_BCRYPT_HASH_HERE'
INVENTORY_NOTIFICATION_NTFY_TOKEN=PASTE_GENERATED_TOKEN_HERE
INVENTORY_NOTIFICATION_NTFY_URL=http://ntfy
INVENTORY_NOTIFICATION_NTFY_PUBLIC_URL=https://ntfy.example.com
```

Replace the placeholders and public hostname. In `.env`, enclose the bcrypt hash in **single quotes** and keep its literal `$` characters. If you instead paste the hash directly into `docker-compose.yml`, escape each `$` as `$$`, even inside YAML quotes. Compose refuses to configure ntfy without a hash or token.

Compose creates the container's `NTFY_AUTH_USERS` as `inventory:<hash>:user`, `NTFY_AUTH_ACCESS` as `inventory:*:wo`, and `NTFY_AUTH_TOKENS` as `inventory:<token>:Inventory API`. The API receives the same token through `INVENTORY_NOTIFICATION_NTFY_TOKEN`; it does not need the plaintext password. `INVENTORY_NOTIFICATION_NTFY_PASSWORD` is used only with username/password authentication when no token is set.

`.env` is excluded from Git and Docker build contexts. Keep the existing hash and token when changing deployment settings; rotating them is not required to switch from a mounted config to environment variables.

## Public URL and proxy

`INVENTORY_NOTIFICATION_NTFY_PUBLIC_URL` also sets ntfy's `NTFY_BASE_URL`, so the server and API use the same public subscription address. Use a reachable HTTPS address in production. For local use, both default to `http://localhost:8090`; update the public URL if you change `NTFY_PORT`.

Port 8090 binds to loopback by default. A host reverse proxy can forward HTTPS to `127.0.0.1:8090`. A container reverse proxy must share a Docker network with ntfy and forward to `ntfy:80`; no published ports are needed for that setup. With custom networks, the API must share ntfy's internal network as well.

The proxy must forward the client IP and support streaming/WebSocket subscriptions. `NTFY_BEHIND_PROXY=true` assumes this proxy setup. `NTFY_UPSTREAM_BASE_URL=https://ntfy.sh` enables iOS wake-up requests; prompt iOS delivery requires a reachable public HTTPS endpoint.

## Apply and verify

```sh
docker compose up -d --no-build ntfy inventory-api
```

Set the stack's `DB_PASSWORD` in `.env` first. The API needs an existing application image. Recreate containers after changing environment settings; `docker compose restart` does not apply changed environment values. Check `docker compose ps ntfy` for a healthy status. The API's startup does not depend on ntfy.

For an existing deployment, remove the old `server.yml` mount when applying the updated service. Keep the auth/cache volumes so the databases persist. The old config file is no longer used and can be removed.

Save a personal topic on the profile page, subscribe to it in the ntfy app using the public URL, then use **Send test notification**. An unauthenticated publish must return 403; an anonymous subscription is allowed.

## Access policy

`NTFY_AUTH_DEFAULT_ACCESS=read-only` allows anyone who knows a topic name to read it, including admin topics. The `inventory` service account has write-only access to every topic through `inventory:*:wo`. Private subscriptions require a different ACL policy and reader credentials.

The account, ACL, and token are provisioned from the environment on startup. Keep their variables set; removing provisioned entries removes them from the database when ntfy next starts. Rotate the publisher token by changing `INVENTORY_NOTIFICATION_NTFY_TOKEN` and recreating both containers.

References: [ntfy configuration and environment variables](https://docs.ntfy.sh/config/#access-control), [Docker installation](https://docs.ntfy.sh/install/#docker), [iOS notifications](https://docs.ntfy.sh/config/#ios-instant-notifications).

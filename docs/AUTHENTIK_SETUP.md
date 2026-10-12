# Authentik setup

How to configure [Authentik](https://goauthentik.io/) as the identity provider. Identity and privacy rules are in [Technical Requirements §5](TECHNICAL_REQUIREMENTS.md); variables are in [`.env.example`](../.env.example).

## 1. Provider and application

1. **Applications → Providers → Create → OAuth2/OpenID Provider**
   - Name: `inventory`
   - Client type: **Public** (the browser SPA cannot keep a secret)
   - Client ID: `inventory` (must equal `OIDC_CLIENT_ID`)
   - Redirect URIs: strict, exactly the app origin with trailing slash, e.g. `https://inventory.example.com/` (`VITE_OIDC_REDIRECT_URI`)
   - Signing key: any RSA certificate (the API validates the JWT signature through JWKS)
   - Scopes: `openid`, `profile`, `email`, `offline_access` (refresh tokens)
   - Subject mode: **Based on the User's hashed ID** or **UUID**. Do not use username or email; the account is bound to `(issuer, sub)` and must stay stable when someone renames themselves.
   - Include claims in id_token: on
2. **Applications → Create** with slug `inventory` and the provider above. The issuer becomes `https://auth.example.com/application/o/inventory/`; set it as `OIDC_AUTH_SERVER_URL` and `VITE_OIDC_AUTHORITY`.
3. Bind the application to the groups below (policy/group bindings) so users without any inventory group cannot even sign in. The API would reject them anyway (403).

## 2. Group claim

The API reads roles and factions from the `groups` claim of the **access token** (`quarkus.oidc.roles.role-claim-path=groups`). Authentik's default `profile` scope mapping includes `groups`; if you use custom scope mappings, keep a mapping that returns:

```python
return {"groups": [group.name for group in request.user.ak_groups.all()]}
```

## 3. Groups

Create one group per role. A user needs **exactly one** role group; if several are present, the first in this order wins:

| Authentik group | App role |
|---|---|
| `inventory_hq_admin` | HQ administrator |
| `inventory_warehouse_crew` | Warehouse crew |
| `inventory_marshal` | Marshal |
| `inventory_event_planner` | Event planner |
| `inventory_maintenance_crew` | Maintenance crew |
| `inventory_read_only` | Read-only participant |
| `inventory_faction_leader` | Faction leader |

Faction membership uses separate groups named `inventory_faction_<EVENT>_<slug>`, for example `inventory_faction_LS_red`. `<EVENT>` is the event type (as in the app's event list) and `<slug>` the faction slug; a faction leader can only order for factions they belong to. Group names are case-sensitive.

Roles and factions are re-read from every token, so group changes take effect at the next token refresh. The app's **Users** page is a read-only mirror; all changes happen in Authentik.

## 4. Token lifetimes and logout

Logout revokes the refresh token, but the API validates access tokens locally until they expire. Choose one bound:

| Option | Settings | Revocation delay |
|---|---|---|
| Short access tokens (recommended) | Provider → Access token validity `minutes=5`; `OIDC_REQUIRE_INTROSPECTION=false` | ≤ 5 minutes |
| Introspection | Confidential client with secret (`BACKEND_OIDC_CLIENT_SECRET`), `OIDC_REQUIRE_INTROSPECTION=true`, `OIDC_TOKEN_CACHE_TTL=60S` | ≤ cache TTL, at the cost of one Authentik call per new token |

Refresh token validity defines how long a device can stay signed in, including offline cold starts (e.g. `days=30`). Enable refresh-token rotation if your Authentik version offers it.

## 5. Separate SPA and API clients (optional)

The default is one public client shared by SPA and API. With two clients (`VITE_OIDC_CLIENT_ID=inventory-app`, `BACKEND_OIDC_CLIENT_ID=inventory-api`), the API requires its own client ID in the token's `aud` claim. Add a scope mapping on the SPA provider that adds `inventory-api` to the audience, otherwise every API call returns 401.

## 6. Check

- [ ] Sign-in redirects back to the app and the header shows the expected role.
- [ ] A user without an inventory role group is refused (API returns 403).
- [ ] Removing a role group takes effect after at most one access-token lifetime.
- [ ] Logout in one tab signs out the other tabs.

These checks are part of [ACC-01](IMPLEMENTATION_PLAN.md).

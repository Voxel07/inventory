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
3. Create the group `inventory` and bind the application to it (policy/group binding), so only its members can sign in. The API checks the same group on every request (403 without it).

## 2. Group claim

The API reads the `groups` claim of the **access token** (`quarkus.oidc.roles.role-claim-path=groups`) only to check the access group. Authentik's default `profile` scope mapping includes `groups`; if you use custom scope mappings, keep a mapping that returns:

```python
return {"groups": [group.name for group in request.user.ak_groups.all()]}
```

## 3. Access and roles

### 3.1 One Authentik group for access

Authentik has exactly one inventory group: **`inventory`** (configurable with `INVENTORY_ACCESS_GROUP`). Membership decides whether a person may use the inventory system at all. Removing someone from the group locks them out at the next access-token refresh; their role in the app is kept for a later return.

Everything else — the assigned roles and the faction memberships — is set in the app on the **Users** page by the inventory admin, with a required reason that is audited (`user.changed`). Changes apply on the user's next request.

**New users start as read only**. The inventory admin can assign one or more roles. Assign only `tenant` to someone who should see private inventory without company data; the highest assigned role determines access.

**First admin.** Set `INVENTORY_BOOTSTRAP_ADMINS` to a comma-separated list of e-mail addresses, matched case-insensitively against the access token's `email` claim. A listed account becomes inventory admin on its first sign-in, and is promoted again whenever no admin exists (recovery). The app never removes the last inventory admin. A missing e-mail claim or a matching username alone never grants bootstrap administration. Only active administrators count for recovery.

### 3.2 Roles

Roles form a **ladder**: each role includes every right of the roles above it in this table.

| App role | Adds to the role above |
|---|---|
| Tenant (`tenant`) | Own private inventory only: private items, assemblies and storage locations (e.g. the rented building), own share groups, public availability with request notifications. Never sees company data. |
| Read only (`read_only`) | Company catalog (items, assemblies, public locations), participants and event timing, all faction and general orders — read only. Adds no items, assemblies, storage locations (not even private ones) or sharing groups |
| Faction leader (`faction_leader`) | Create and edit faction order lists for the user's own factions; return and report items in their own custody |
| ASH crew (`ash`) | General (non-faction) orders and item takeout, including pickup of prepared faction and general orders. Preparation, returns and closing remain with the warehouse |
| Warehouse crew (`warehouse_crew`) | All catalog work, all operations (stock, counts, transfers, loans, receiving, purchasing, maintenance, repairs, reports), preparing and handing out orders (pickup, returns, close), damage reports, custody overview, history; order lists for every faction |
| Inventory admin (`admin`) | Everything: user roles and factions, events, participants and timing, procurement planning, write-offs, count approval, audit and recovery, ownership transfer, every private resource |

Every role from faction leader up also has the tenant's private-inventory rights: they can add private items, assemblies and storage locations, share them and make them publicly available. Read-only members add nothing; they only use what is shared with them.

**Factions.** On the same Users page the admin assigns factions (event type and faction, stored as `EVENT:slug`). Every organization member *reads* all factions' order lists; faction leaders and ASH crew only *create and change* lists of the factions assigned to them. Warehouse crew and the inventory admin change every list.


### 3.3 Permission matrix

| Capability | Tenant | Read only | Faction leader | ASH crew | Warehouse crew | Inventory admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Add own private items, locations, assemblies; public availability | ✓ | | ✓ | ✓ | ✓ | ✓ |
| Share groups; use resources shared with them | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| See company items, assemblies and public locations | | ✓ | ✓ | ✓ | ✓ | ✓ |
| See participants and event timing | | ✓ | ✓ | ✓ | ✓ | ✓ |
| See faction and general orders | | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/edit/submit/withdraw faction orders (own factions) | | | ✓ | ✓ | ✓ (all) | ✓ (all) |
| Return/report items in own custody | | | ✓ | ✓ | ✓ | ✓ |
| General orders (own) | | | | ✓ | ✓ (all) | ✓ (all) |
| Company catalog and storage edits | | | | | ✓ | ✓ |
| Prepare orders, cancel during preparation | | | | | ✓ | ✓ |
| Hand out and take back: pickup, returns, close, damage reports, custody overview | | | | | ✓ | ✓ |
| Stock, counts, transfers, loans, receiving, purchasing | | | | | ✓ | ✓ |
| Maintenance, repairs, schedules | | | | | ✓ | ✓ |
| History and operational reports | | | | | ✓ | ✓ |
| Events, participants, timing (edit); procurement planning | | | | | | ✓ |
| Write-offs, count approval, users, audit, recovery | | | | | | ✓ |
| Every private resource, ownership transfer | | | | | | ✓ |

Private resources are never visible through a role alone (except to the inventory admin): they need ownership, a share, a share of the storage location they are kept in, or public availability (§3.4).

### 3.4 Company and private equipment

- **Company equipment** has no private policy. It is visible to every organization member (read only and up) and managed by the warehouse crew.
- **Private equipment** belongs to a user account. Only the owner, the inventory admin and people or groups it is shared with see it. Sharing is done on the item, assembly or location (**Access & sharing**). Changes are revision-checked and audited; managing sharing requires no reason.
- **Sharing groups** (`/sharing`, and on the Users page for admins) are owned by the user who creates them; members, the owner and the inventory admin see the member names directly in the group list. Only the owner and inventory admin change membership. Groups created by the inventory admin as *admin groups* can be used by everyone. Share groups are app data, separate from the Authentik groups above.
- **Location sharing is inherited.** A share on a private storage location also applies to its private sub-locations and to every private item whose home location is inside it. The location owner can view and edit what others store there, but cannot change those items' sharing. Sub-locations of a private location must be private.
- **Public availability.** While creating a privately owned item, or later through Edit item or Manage sharing, the owner can make it publicly available. Organization members (not unrelated tenants) can see it read-only and put it on faction and general orders. Usable stock, reservations, damage and maintenance determine availability; private items have no commitment workflow. Ownership and edit permissions stay with the owner and authorized editors. The owner receives an in-app notification (`item_requested`) when it is on a submitted order or a pickup/damage request, once per order or request.

The creator is automatically responsible for a new item. Editors can change this later to an account or free-text name. Without warehouse access, account choices are restricted server-side to the editor and people in sharing groups they own or belong to. Assigning responsibility does not grant item access. Free-text contacts receive no in-app notifications.

### 3.5 Scenarios

| Situation | Role and factions (set in the app) | Result |
|---|---|---|
| Company tent for the KGG faction at DE | Faction leader, faction DE · KGG | Sees the tent in the catalog, puts it on the KGG list and submits; the warehouse prepares and hands it out. |
| ASH crew member who also leads a faction | ASH crew + Faction leader, faction DE · KGG | Assign ASH crew and faction leader independently, plus DE · KGG membership. ASH is the effective role; both assignments are retained. May take items out and pick up prepared orders. |
| ASH crew needs a stage kit | ASH crew | Creates and submits a general order; the warehouse prepares it. ASH crew may pick it up or check out items directly. |
| Leader of two factions | Faction leader, factions DE · KGG and LS · Red | Edits both factions' lists; reads every other list. |
| Building tenant who stores own equipment | Tenant (explicitly assigned) | Creates a private location for the building, adds items, creates a share group "Hall crew" and shares the building with it; the group sees everything stored there. Sees nothing of the company inventory. |
| Tenant lends a generator for an event | Tenant | Makes the generator publicly available when adding it or later; faction leaders order it; the tenant gets a notice per order. Warehouse staff need a share of the building (or the item is brought in) to collect it. |
| Read-only participant | Read only | Reads catalog, orders, participants and timing; cannot add items, assemblies or storage locations. |

### 3.6 Changes take effect

Access (the `inventory` group) is re-read from every token, so removing someone takes effect at the next token refresh. Role and faction changes made on the Users page apply on the user's next API request. Open browsers of that account refresh it on `user.changed` and discard cached views; other sessions only refresh account lists (`users.changed`).

## 4. Token lifetimes and logout

Online logout registers the current access-token SHA-256 hash until expiry and revokes the provider refresh token. Later API requests with that token are rejected; existing SSE streams check the registry/account every ten seconds. Offline/provider-only logout and Authentik group removal still depend on access-token expiry or introspection. Choose a provider-removal bound:

| Option | Settings | Revocation delay |
|---|---|---|
| Short access tokens (recommended) | Provider → Access token validity `minutes=5`; `OIDC_REQUIRE_INTROSPECTION=false` | ≤ 5 minutes |
| Introspection | Confidential client with secret (`BACKEND_OIDC_CLIENT_SECRET`), `OIDC_REQUIRE_INTROSPECTION=true`, `OIDC_TOKEN_CACHE_TTL=60S` | ≤ cache TTL, at the cost of one Authentik call per new token |

Refresh token validity defines how long a device can stay signed in, including offline cold starts (e.g. `days=30`). Enable refresh-token rotation if your Authentik version offers it.

## 5. Separate SPA and API clients (optional)

The default is one public client shared by SPA and API. With two clients (`VITE_OIDC_CLIENT_ID=inventory-app`, `BACKEND_OIDC_CLIENT_ID=inventory-api`), the API requires its own client ID in the token's `aud` claim. Add a scope mapping on the SPA provider that adds `inventory-api` to the audience, otherwise every API call returns 401.

## 6. Check

- [ ] Sign-in redirects back to the app; a new user is shown as read only, a bootstrap admin as inventory admin.
- [ ] A user outside the `inventory` group is refused (API returns 403).
- [ ] Changing a role on the Users page applies on that user's next request.
- [ ] A tenant sees only their own private items and locations, no orders or events.
- [ ] A faction leader can edit lists of their own factions only, but reads all lists.
- [ ] Removing a user from `inventory` takes effect after at most one access-token lifetime.
- [ ] Logout in one tab signs out the other tabs.

These checks are part of [ACC-01](IMPLEMENTATION_PLAN.md).

Local deactivation on the Users page blocks new REST, MCP and replay requests immediately. It does not automatically mirror IdP directory changes. See [lifecycle and personal-data contracts](WORKFLOW_CONTRACTS.md).

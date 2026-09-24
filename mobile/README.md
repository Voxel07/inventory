# ASH Inventory React Native client

This Expo app shares one React Native interface across Android, iOS, and desktop browsers. It uses the existing Quarkus API. The current client covers catalog search, item and asset QR/barcode lookup, warehouse checkout and check-in, offline catalog access, and transaction sync. The existing web app remains available for order management, administration, maps, maintenance, and other workflows not yet in this client.

## Configure

1. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL` to the public HTTPS API URL. It must be reachable from the phone. For local Android emulators, use your host's reachable address or `10.0.2.2`; a physical phone needs your LAN or public address.
2. Set `EXPO_PUBLIC_OIDC_AUTHORITY` and `EXPO_PUBLIC_OIDC_CLIENT_ID` to the same Authentik public client used by the existing app. The provider must allow the native `ashinventory://auth` redirect URI and the web URL `<desktop-origin>/auth`. Use the exact redirect URI produced by Expo for your build if it differs. The `offline_access` scope must be enabled for refresh tokens.
3. Allow the desktop web origin in backend `CORS_ORIGINS`. Mobile native requests do not use browser CORS. Desktop camera access requires localhost or HTTPS.
4. For local backend development without OIDC, leave both OIDC variables empty and enable `DEV_AUTH_ENABLED=true` on the backend.

## Run

```bash
cd mobile
npm install
npm run web
```

### Physical phone in development

Install an ASH Inventory development build on the phone once, then use Metro for live code changes. The project includes `expo-dev-client` and the `development` EAS build profile.

**The QR code from `npm run dev:phone` is a launch link, not an installer.** If Android says the app is not installed, complete the Android build and installation below first. `eas init` only links this source folder to an Expo project; it does not produce an APK.

```bash
# From mobile/, after setting .env.local
npx eas-cli@latest login
npx eas-cli@latest init
```

- **Android:** Run `npx eas-cli@latest build --platform android --profile development`. Wait for the build to finish, then open the **finished build's install link** on the phone and install the APK. Only then run `npm run dev:phone` and scan its QR. With Android Studio and a USB-connected phone, `npx expo run:android --device` is a local alternative.
- **iPhone from Windows:** An active Apple Developer Program account is needed. Run `npx eas-cli@latest device:create` to register the phone, then `npx eas-cli@latest build --platform ios --profile development`. Install the finished build from its link and enable iOS Developer Mode if prompted.

Once installed, keep the computer and phone on the same network and run:

```bash
npm run dev:phone
```

Scan the Metro QR code with the phone, or open the installed ASH Inventory development app and choose the detected server. If the phone cannot reach Metro on your LAN, try `npx expo start --dev-client --tunnel`. The tunnel only connects to Metro; `EXPO_PUBLIC_API_URL` and the Authentik authority must still be reachable from the phone. Rebuild the development app after changing native packages or `app.json`; JavaScript changes only need a reload.

OIDC sign-in needs the app's `ashinventory://auth` redirect URI registered in Authentik. Expo Go does not register this scheme, so use the installed development build for sign-in testing.

The deprecation messages during `npx eas-cli@latest` installation come from that separately downloaded CLI's dependency tree. Updating this app's Expo packages does not remove them. This project uses the SDK 57 compatible package versions checked by Expo Doctor; do not force newer React Native or beta Expo versions to silence CLI warnings.

For deployable bundles, run `npx expo export --platform all`. The desktop web export is in `mobile/dist` and can be hosted over HTTPS. Native store packages can be produced with `npx eas-cli@latest build --platform android` and `npx eas-cli@latest build --platform ios` after configuring Expo credentials and environment variables for the build.

## Offline behavior

- On sign-in the client saves the complete item catalog and preloads serialized asset labels. The catalog uses SQLite on Android/iOS and IndexedDB on the desktop web origin. It is scoped to the signed-in inventory user.
- Native auth tokens use the OS secure store. Browser auth is origin scoped in IndexedDB, which does not provide an equivalent secure store.
- Network failures while saving checkout or check-in queue the action locally with a UUID idempotency key. The queue is scoped to the signed-in user and survives app restarts and sign-out. Sign back into the same account to sync it.
- Sync runs when connectivity returns, when the app becomes active, and from **Sync now**. The backend `/api/sync` endpoint deduplicates by idempotency key. Rejected/conflicting actions are retained as visible issues until reviewed and discarded.
- The displayed stock count is the last server snapshot; queued offline actions do not change it until sync succeeds. A long-offline catalog can be stale, and the server may reject actions that conflict with newer stock.

Only item and asset codes resolve offline. Order and assembly QR codes remain workflows of the existing web app.

# Relay iOS client

Expo SDK 57, React Native, TypeScript, Expo Router. Customer-facing client for the Relay support
desk. Design and decision records live in the parent repo, `raufkhandevs/relay`, under `docs/`.

The API is `relay-laravel` and must be running. Response shapes are defined there; this repo
declares its own copies in `src/types/api.ts` because the backend's generated types are not
published anywhere this repo can import from.

@AGENTS.md

Expo moves fast and its API surface changes between SDKs. Read the versioned docs for the SDK in
`package.json`, not a search result for an older one.

## Conventions specific to this repo

- **Tokens live in the iOS Keychain** via `expo-secure-store`. Never `AsyncStorage`, never a file,
  never in memory only. AsyncStorage is plaintext on disk and is included in device backups.
- **Nothing secret goes in the bundle.** It ships to the device and can be read. `EXPO_PUBLIC_*`
  values are public by definition; the Reverb app key is one, the Reverb secret is not and never
  appears here.
- **Every interactive element gets a `testID`.** RN `Text` often does not reach the accessibility
  tree, so without one, automation falls back to pixel coordinates that break on any layout change.
- **`npx expo install`, not `npm install`,** for anything in the Expo ecosystem. It picks
  SDK-matched versions.
- **`ios/` and `android/` are generated output** and stay gitignored. Config plugins, not hand edits.
- **Echo needs `authEndpoint` set explicitly** to `${API_BASE}/api/broadcasting/auth`. The default
  `/broadcasting/auth` does not exist on this backend.
- **`listen()` event names take a leading dot**: `.message.created`. Without it Echo expects a fully
  qualified PHP class name and matches nothing, silently.
- **pusher-js's React Native build exports `Pusher` as a named export**, not a default, so it is
  unwrapped in `src/lib/echo.ts`. Do not simplify that back to a default import.
- **`src/lib/config.ts` has no imports and must stay that way.** It exists to break the
  auth -> echo -> api -> auth cycle. Anything importing from `api.ts` inside `auth.tsx` rebuilds it.
- **Sign out revokes server side** before clearing locally, and clears the query cache. Both matter:
  a token that outlives its session is a leaked credential, and a cache that outlives it shows one
  user another user's data on a shared device.

## Never

- Commit `.env`, or `ios/`, or `android/`.
- Run `git push`. Rauf pushes, always. Commit locally and hand him the command.
- Add code whose only purpose is to let an agent drive the UI. Use Maestro.
- Store a token anywhere but the Keychain.

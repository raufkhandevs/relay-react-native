# Relay iOS

The customer-facing iOS client for Relay, a support desk. Read a thread, reply, and watch an
agent's answer arrive without touching anything.

One of four repos. The parent, [raufkhandevs/relay](https://github.com/raufkhandevs/relay), holds
the design and decision records. The API and websocket server live in
[relay-laravel](https://github.com/raufkhandevs/relay-laravel) and must be running for this app to
do anything.

## Progress

```
Login, Keychain token     ████████████████████  done
Ticket list and thread    ████████████████████  done
Live messages             ████████████████████  done
Reply and photo upload    ████████████████████  done
Light and dark            ████████████████████  done
Typing indicator          ░░░░░░░░░░░░░░░░░░░░  next
Offline outbox            ░░░░░░░░░░░░░░░░░░░░
Camera capture            ░░░░░░░░░░░░░░░░░░░░  needs a device
Push notifications        ░░░░░░░░░░░░░░░░░░░░  blocked
```

**Blocked, not forgotten.** Push needs an Apple Developer Program membership, which this project
does not buy. Camera capture is unbuilt because the simulator has no camera, and building a path
that cannot be tested is how untested paths ship.

## Running it

The backend first, in its own checkout:

```bash
cd ../backend-laravel && docker compose up -d && composer dev
```

Then this app:

```bash
npm install
cp .env.example .env     # then fill in EXPO_PUBLIC_REVERB_APP_KEY
npx expo run:ios
```

Seeded accounts, both password `password`:

| Email | Sees |
|---|---|
| `priya@relay.test` | her own tickets only |
| `agent@relay.test` | every ticket |

Sign in as Priya, open the ticket, then post a message as the agent from the web client or over the
API. It appears on the phone with no interaction.

## Expo Go will not work

This app stores its auth token in the iOS Keychain via `expo-secure-store`, which is a native
module. Expo Go cannot load native modules, so the app runs as a development build from the first
run. `npx expo run:ios` builds it; the first build takes several minutes.

## The two commands and the difference between them

```bash
npx expo start      # ships JavaScript. Fast refresh. Use this all day.
npx expo run:ios    # builds and installs the app itself. Minutes.
```

Changed a component? `expo start` is enough. Added a native dependency, an icon, a permission
string or anything in `app.json`? You need `run:ios`. Getting this wrong means editing code and
watching nothing change, which is the single most common way to lose an hour here.

## Things that will catch you out

- **`ios/` is generated**, by `expo prebuild` from `app.json`. It is gitignored on purpose. Never
  hand edit it; use a config plugin.
- **`Command PhaseScriptExecution failed`** means Xcode cannot see node, because node comes from
  volta. Fix once per machine: `echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local`
- **No eligible build destination** means Xcode's simulator SDK has no matching runtime installed.
  `xcodebuild -downloadPlatform iOS`. This blocks physical devices too, not just simulators.
- **`Bundled 1 module`** in the Metro log is a fast refresh, not a reload. A real reload reports
  over a thousand. If your change is not appearing, check that number before debugging the change.
- **Check which simulator is booted.** `xcrun simctl list devices booted`. Restarting Metro can boot
  a different one, which may carry an older install of the app, and you will reload JavaScript
  against native code from an hour ago.
- **Realtime silently does nothing** if Reverb is not running, if `authEndpoint` is wrong, or if
  the `listen()` event name is missing its leading dot. See the run-app skill for the checklist.

## Automation

Driven with [Maestro](https://maestro.mobile.dev). Rows carry `testID`s, so flows address elements
by identity rather than screen position:

```yaml
- tapOn:
    id: "ticket-row-1"
```

This matters more on React Native than on the web: RN `Text` frequently does not appear in the
accessibility tree, so matching on visible words fails even when they are plainly on screen. Any
new interactive element gets a `testID`.

## Design

Palette, type and the status-edge device are shared with the other two clients and defined in
the parent repo's `docs/decisions/0009-one-design-system-two-densities.md`. The customer surfaces
run the system roomy; the agent console runs it compact.

---
name: run-app
description: Start, build and drive the Relay iOS app on the simulator, and diagnose why a change is not appearing or why realtime is silent. Use whenever this app needs running, rebuilding, or automating, or when a code change seems to have no effect.
---

# Running the Relay iOS app

The backend must be up first. This app is a client and does nothing without it.

```bash
cd ../backend-laravel && docker compose up -d && composer dev
```

Then, in this repo:

```bash
npx expo start      # JavaScript only, fast refresh
npx expo run:ios    # builds and installs the app, minutes
```

Seeded accounts, both password `password`: `priya@relay.test` (one ticket), `agent@relay.test`
(all five).

## Which command do I need

`expo start` ships JavaScript. `expo run:ios` ships the app.

Rebuild with `run:ios` after: a new native dependency, anything in `app.json`, an icon, a
permission string, an entitlement. Everything else is a fast refresh.

## My change is not appearing

Check these in order. Each has cost an hour on this project.

1. **Read the module count in the Metro log.** `Bundled 1 module` is a no-op fast refresh. A real
   reload reports over a thousand. A small number means your file was not rebundled.
2. **Check which simulator is booted**: `xcrun simctl list devices booted`. Restarting Metro can
   boot a different device, and that device may carry an older native install. You would be
   reloading JavaScript against native code from an hour ago.
3. **Clear the Metro cache**: `npx expo start --clear`.
4. **Rebuild**: `npx expo run:ios`.

## Realtime is silent

No error appears for any of these. Check in order.

1. Is `reverb:start` running. It is one of the four processes in the backend's `composer dev`.
2. Is `EXPO_PUBLIC_REVERB_APP_KEY` set in `.env`. Without it `getEcho` throws on first use.
3. Does `authEndpoint` point at `/api/broadcasting/auth`. The Echo default is `/broadcasting/auth`,
   which 404s here.
4. Does `listen()` start with a dot: `.message.created`. Without it Echo matches nothing.
5. Is the bearer token being sent as a channel auth header. The web client uses a session cookie;
   this one has none.

## Driving the app without a human

Maestro. Installed at `~/.maestro-install/maestro/bin/maestro`.

```bash
export PATH="$HOME/.maestro-install/maestro/bin:$PATH"
maestro test /tmp/flow.yaml
```

Keep flows in `/tmp`, not this repo. Address elements by `testID`, never by visible text:

```yaml
appId: com.aswad-1.mobile-react-native
---
- launchApp
- assertVisible: "Tickets"
- tapOn:
    id: "ticket-row-1"
- assertVisible: "Back"
```

React Native `Text` often does not appear in the accessibility tree, so `tapOn: "TKT-1"` fails
even when those characters are visible on screen. If an element cannot be addressed by `testID`,
add one rather than falling back to coordinates.

Screenshots: `xcrun simctl io booted screenshot /tmp/name.png`. Save outside the repo.

## Xcode will not build

- `Command PhaseScriptExecution failed` means Xcode cannot see node, because node comes from volta.
  `echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local`
- No eligible destination, or "iOS x.y is not installed", means the simulator runtime does not match
  Xcode's SDK. `xcodebuild -downloadPlatform iOS`. This blocks physical devices too.
- Confirm what Xcode can actually see:
  `xcodebuild -workspace ios/*.xcworkspace -scheme mobilereactnative -showdestinations`

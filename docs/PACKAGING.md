# Packaging & notarization (macOS)

Docket’s primary desktop shell is **Tauri 2** (`apps/desktop`).

## Dev / unsigned local build

```bash
# from repo root
npm run install:all
npm run desktop:dev          # live reload (starts core if :8787 is free)

# production-ish local .app / .dmg (unsigned) and open it
./app.sh
# or: npm run app
```

`./app.sh --open-only` opens a previous build. `./app.sh --reinstall` runs npm install first.

```bash
# production-ish local .app / .dmg (unsigned) without opening
cd apps/desktop
npm run build                # stages apps/core into the bundle, then tauri build
```

The `.app` starts **core** on `127.0.0.1:8787` if it is not already running. It finds Node via nvm or Homebrew (Finder apps do not get your shell PATH). OAuth keys come from `apps/core/.env` on this machine, or `~/.docket/.env`. Logs: `~/.docket/core.log`.

Output typically under:

- `apps/desktop/src-tauri/target/release/bundle/macos/Docket.app`

Local builds only package the **`.app`**. A `.dmg` is optional (create-dmg often fails if a previous image is still mounted). To try a disk image: set `"bundle": { "targets": ["app", "dmg"] }` in `tauri.conf.json` and unmount leftover `/Volumes/dmg.*` first.

Gatekeeper may block an unsigned `.app`. `./app.sh` clears quarantine; otherwise right-click → Open.

## Notarization (requires your Apple Developer account)

Notarization **cannot** be completed in CI or by an agent without your secrets.

1. Enroll in [Apple Developer](https://developer.apple.com/).
2. Create a **Developer ID Application** certificate in Keychain.
3. Create an app-specific password for `notarytool`.
4. Configure Tauri signing env vars (example):

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID"
```

5. Build with signing (see [Tauri macOS codesign](https://v2.tauri.app/distribute/sign/macos/)):

```bash
cd apps/desktop
npx tauri build
# then notarize the .app / .dmg with notarytool staple
```

## What we ship without notarization

- Clone-and-run via `./up.sh` / `./up.sh --desktop`
- Unsigned local bundles for personal use (Gatekeeper may warn)

## Checklist before a public binary

- [ ] Codesign with Developer ID
- [ ] Notarize + staple
- [ ] Hardened runtime / entitlements review (network localhost, keychain, notifications)
- [ ] Confirm core still binds `127.0.0.1` only
- [ ] No secrets in the bundle

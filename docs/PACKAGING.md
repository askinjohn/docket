# Packaging & notarization (macOS)

Docket’s primary desktop shell is **Tauri 2** (`apps/desktop`).

## Dev / unsigned local build

```bash
# from repo root
npm run install:all
npm run desktop:dev          # live reload

# production-ish local .app (unsigned)
cd apps/desktop
npm run build                # or: npx tauri build
```

Output typically under:

- `apps/desktop/src-tauri/target/release/bundle/macos/Docket.app`
- `apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg`

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

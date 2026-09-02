# Gmail OAuth setup (Phase 1)

Docket talks to Gmail via the **Gmail API**. Tokens stay on your machine under `~/.docket/` (or the OS keychain — see below).

## 1. Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (e.g. `docket-dev`)
3. **APIs & Services → Library** → enable **Gmail API**
4. **APIs & Services → OAuth consent screen**
   - User type: **External** (or Internal if Workspace)
   - App name: Docket
   - Add your Google account as a **test user**
5. **Credentials → Create credentials → OAuth client ID**
   - Application type: **Desktop app** (or Web with loopback)
   - Name: Docket Core

## 2. Redirect URI

Authorized redirect URI **must** be:

```text
http://127.0.0.1:8787/auth/gmail/callback
```

(If you change `DOCKET_CORE_PORT`, update both Google Console and `.env`.)

## 3. Local env

```bash
cd apps/core
cp .env.example .env
# edit .env — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
```

## 4. Run

```bash
# terminal 1
cd apps/core && npm install && npm run dev

# terminal 2
cd apps/web && npm start
```

1. Open Docket (Dock app or http://127.0.0.1:4300)  
2. Click **Connect Gmail** — this opens your **system browser** (Chrome/Safari), not the in-app webview, so password managers (e.g. Proton Pass) work  
3. Consent in Google  
4. Return to Docket; the app polls until connected and syncs the inbox  


## Scopes used

- `gmail.modify` — read, archive, labels  
- `gmail.send` — send replies  
- `userinfo.email` — show connected address  

## Token storage (configurable)

After cloning, pick how OAuth tokens are stored in `apps/core/.env`:

| `DOCKET_TOKEN_STORE` | Where secrets live | When to use |
|--------------------------|--------------------|-------------|
| **`sqlite`** (default) | `access_token` / `refresh_token` columns in `mail.sqlite` | Easy first run, CI, quick dogfood |
| **`keychain`** | macOS Keychain / Windows Credential Manager / libsecret via **keytar** | Daily driver; SQLite no longer holds refresh tokens |

```bash
# Recommended for personal Mac use
DOCKET_TOKEN_STORE=keychain
cd apps/core && npm install keytar   # optionalDependency; native build
```

- Switching **sqlite → keychain**: next API use migrates existing tokens into the keychain and clears them from SQLite.  
- Switching **keychain → sqlite**: re-connect Gmail (or tokens remain only in the keychain until re-auth writes to SQLite).  
- `/health` reports `"tokenStore": "sqlite" | "keychain"`.

## Security

- Core binds to **127.0.0.1** only  
- Do not commit `.env` or `~/.docket/*.sqlite`  
- Prefer `DOCKET_TOKEN_STORE=keychain` so a copied DB is not a full Gmail session  
- For personal use, keeping the app in **Testing** on the consent screen is fine with your test user  
- Revoke access anytime: [Google Account → Third-party access](https://myaccount.google.com/permissions)

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 503 on Connect | `.env` missing client id/secret; core restarted after edit |
| redirect_uri_mismatch | Exact URI in Google Console |
| empty inbox after auth | Wait for sync; click **Sync**; check core logs |
| token errors | Re-connect (consent) so refresh_token is stored |

# Gmail OAuth setup (Phase 1)

Local Mail talks to Gmail via the **Gmail API**. Tokens stay on your machine in SQLite under `~/.local-mail/`.

## 1. Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (e.g. `local-mail-dev`)
3. **APIs & Services → Library** → enable **Gmail API**
4. **APIs & Services → OAuth consent screen**
   - User type: **External** (or Internal if Workspace)
   - App name: Local Mail
   - Add your Google account as a **test user**
5. **Credentials → Create credentials → OAuth client ID**
   - Application type: **Desktop app** (or Web with loopback)
   - Name: Local Mail Core

## 2. Redirect URI

Authorized redirect URI **must** be:

```text
http://127.0.0.1:8787/auth/gmail/callback
```

(If you change `LOCAL_MAIL_CORE_PORT`, update both Google Console and `.env`.)

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

1. Open Local Mail (Dock app or http://127.0.0.1:4300)  
2. Click **Connect Gmail** — this opens your **system browser** (Chrome/Safari), not the in-app webview, so password managers (e.g. Proton Pass) work  
3. Consent in Google  
4. Return to Local Mail; the app polls until connected and syncs the inbox  


## Scopes used

- `gmail.modify` — read, archive, labels  
- `gmail.send` — send replies  
- `userinfo.email` — show connected address  

## Security

- Core binds to **127.0.0.1** only  
- Do not commit `.env` or `~/.local-mail/*.sqlite`  
- For personal use, keeping the app in **Testing** on the consent screen is fine with your test user  

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 503 on Connect | `.env` missing client id/secret; core restarted after edit |
| redirect_uri_mismatch | Exact URI in Google Console |
| empty inbox after auth | Wait for sync; click **Sync**; check core logs |
| token errors | Re-connect (consent) so refresh_token is stored |

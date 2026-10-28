# Memecoin X Scout

Local-first X-only discovery dashboard for recently active memecoin project accounts across all chains, with AI-assisted, human-approved X publishing.

## Requirements
- Node.js 22+ and npm
- Google Chrome/Chromium with a dedicated CDP profile signed into X
- OpenRouter API key for account classification and drafting
- X developer app with OAuth 2.0 user-context `tweet.read`, `tweet.write`, `users.read`, `offline.access` for publishing. X API access may require a paid tier.

## Setup
```bash
npm install
cp .env.example .env
# Edit .env: OPENROUTER_API_KEY, X_CLIENT_ID, optionally X_CLIENT_SECRET
# In X developer settings register exact callback: http://127.0.0.1:3000/api/x/callback
# Start Chrome separately:
google-chrome --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$HOME/.config/memecoin-x-scout"
# Log in to X in this Chrome profile, then:
npm run dev
```
Visit http://127.0.0.1:3000. Click **Connect X account** to authorize publishing. Keep Chrome open for discovery. The publishing API does not require CDP.

## Features
- Search X Live tab for configured queries, scroll and collect mentioned/author profile handles.
- Open profiles, collect public bio/name/followers/website/recent posts, AI-classify account type and chain (or Unknown).
- Persist unique accounts and evidence source links in SQLite `data/scout.db`.
- Start, stop, one-shot scan, periodic scans, logs, filters, CSV export.
- AI Studio for posts/replies: request draft, edit, explicitly confirm, publish via official X API, save direct URL returned by X.
- Visible purple cursor overlay in Chrome tabs during discovery. If X page CSP or dynamic rendering prevents injection, inspect logs and try Chrome in headed mode.

## Limitations and security
- X DOM structure can change; CDP-based discovery may require selector maintenance and may be restricted by X rules. Use only in accordance with applicable platform rules; prefer authorized X APIs for production discovery. This is not an officially supported X scraping integration.
- The classification is heuristic and may include influencer or false-project accounts. Review evidence before outreach.
- OAuth credentials are stored in local SQLite in plaintext; keep the app bound to 127.0.0.1, protect the machine and database. This prototype is **not** suitable for exposing on the public internet without authentication and encryption at rest.
- OpenRouter classification failures store `uncertain` rather than fabricate a verdict.
- Publication records are written only after X returns a post ID. A network failure after X accepts a post may leave a published post without a local record; check X before retrying.
- `npm run check` runs TypeScript validation. `npm test` runs unit tests.
- No automatic unsolicited replies, likes, follows or DMs.

# Memecoin X Scout

Local-first X-only discovery dashboard for recently active memecoin project accounts across all chains, with AI-assisted, human-approved X publishing.

## Requirements
- Node.js 22+ and npm
- Google Chrome/Chromium with a dedicated CDP profile signed into X
- OpenRouter API key for account classification and drafting

## Setup
```bash
npm install
cp .env.example .env
# Edit .env: OPENROUTER_API_KEY
# Start Chrome separately:
google-chrome --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$HOME/.config/memecoin-x-scout"
# Log in to X in this Chrome profile, then:
npm run dev
```
Visit http://127.0.0.1:3000. Keep Chrome open and signed in. Draft handoff uses CDP and requires no X API credentials.

## Features
- Search X Live tab for configured queries, scroll and collect mentioned/author profile handles.
- Open profiles, collect public bio/name/followers/website/recent posts, AI-classify account type and chain (or Unknown).
- Persist unique accounts and evidence source links in SQLite `data/scout.db`.
- Start, stop, one-shot scan, periodic scans, logs, filters, CSV export.
- AI Studio: generate and edit a draft, click Prepare in Chromium to fill the editor, manually click Post/Reply inside X. Paste the resulting post URL in History.
- Visible purple cursor overlay in Chrome tabs during discovery. If X page CSP or dynamic rendering prevents injection, inspect logs and try Chrome in headed mode.

## Limitations and security
- X DOM structure can change; CDP-based discovery may require selector maintenance and may be restricted by X rules. Use only in accordance with applicable platform rules; prefer authorized X APIs for production discovery. This is not an officially supported X scraping integration.
- The classification is heuristic and may include influencer or false-project accounts. Review evidence before outreach.
- OAuth credentials are stored in local SQLite in plaintext; keep the app bound to 127.0.0.1, protect the machine and database. This prototype is **not** suitable for exposing on the public internet without authentication and encryption at rest.
- OpenRouter classification failures store `uncertain` rather than fabricate a verdict.
- Preparing drafts does not publish. The History screen tracks prepared drafts and manually verified published links.
- `npm run check` runs TypeScript validation. `npm test` runs unit tests.
- No automated publishing, unsolicited replies, likes, follows or DMs. X prohibits non-API website-scripting automation: https://help.x.com/en/rules-and-policies/x-automation

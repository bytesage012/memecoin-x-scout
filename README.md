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
Visit http://127.0.0.1:3000. Keep Chrome open and signed in. Posting uses your connected Chrome CDP session and requires no X API credentials. Each post requires explicit approval in the dashboard.

## Features
- Search X Live tab for configured queries, scroll and collect mentioned/author profile handles.
- Open profiles, collect public bio/name/followers/website/recent posts, AI-classify account type and chain (or Unknown).
- Persist unique accounts and evidence source links in SQLite `data/scout.db`.
- Start, stop, one-shot scan, periodic scans, logs, filters, CSV export.
- AI Studio: generate and edit a draft, then click **Accept & Post to X**. The browser submits exactly that approved post or reply, observes X's CreateTweet response, and stores the direct link when confirmed.
- Visible purple cursor overlay in Chrome tabs during discovery. If X page CSP or dynamic rendering prevents injection, inspect logs and try Chrome in headed mode.

## Limitations and security
- X DOM structure can change; CDP-based discovery may require selector maintenance and may be restricted by X rules. Use only in accordance with applicable platform rules; prefer authorized X APIs for production discovery. This is not an officially supported X scraping integration.
- The classification is heuristic and may include influencer or false-project accounts. Review evidence before outreach.
- Keep the local dashboard bound to 127.0.0.1. Do not expose the unauthenticated control panel on the public internet. Never commit OpenRouter credentials or Chrome profiles.
- OpenRouter classification failures store `uncertain` rather than fabricate a verdict.
- A single approved dashboard click submits one post or reply. If X's response cannot be verified, the entry is marked `unconfirmed` and the tab is left open for inspection rather than blindly retrying.
- `npm run check` runs TypeScript validation. `npm test` runs unit tests.
- User-approved CDP publication is implemented; no unattended mass replies, automated likes/follows, or DMs. Browser scripting may violate X's automation rules and may put the account at risk: https://help.x.com/en/rules-and-policies/x-automation


## Rate-limit protection
- Discovery now rotates **two configured X searches per cycle** instead of scanning every query each time.
- Each search uses no more than two scroll rounds, and a cycle visits at most eight new profiles.
- The scheduler runs at least every 20 minutes; manual Scan Once still obeys an active X cooldown.
- When X responds with HTTP 429, scanning stops and waits at least 30 minutes before resuming. A longer cooldown may be necessary depending on X's limits.
- OpenRouter's HTTP 429 response triggers a shared cooldown that uses `Retry-After` if provided (capped at one hour). Accounts saved without classification can be re-evaluated after cooldown in a future iteration.
- Avoid opening extra crawler copies or rotating accounts/proxies to evade rate limits. Check `/api/events` to see which service is limiting.

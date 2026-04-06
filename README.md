# MiddleEastWar

## Get all modules (install dependencies)

```bash
npm install
```

## Start the server

```bash
npm start
```

Uses `server.js` at the repo root (or `node src/server/server.js`). If something runs `node server.js`, that file forwards to the real app.

For local dev, `SESSION_SECRET` is optional unless `NODE_ENV=production`: a dev-only default is used and a warning is printed. For anything serious, copy `.env.example` → `.env` and set `SESSION_SECRET` (and optional overrides).

## Stop the server

```bash
bash scripts/stop-server.sh
```

## War rules engine (maintainable rules)

Rules are stored outside the engine code in:

- `warengine/war-rules.json`

You can change weights and bonuses there without editing the engine implementation.

### Resolve a battle

Use this API:

- `POST /api/resolve-battle`

Request body example:

```json
{
  "attackerId": "israel",
  "defenderId": "iran",
  "startedBy": "israel",
  "attackerForcesPct": 0.7,
  "defenderForcesPct": 0.8
}
```

Notes:

- `attackerForcesPct` and `defenderForcesPct` are from `0` to `1`.
- Winner is decided by weighted military power + rule modifiers from `rules/war-rules.json`.

## Google SSO and per-player saved game

The app now requires Google sign-in before the game is accessible.

Required environment variables:

- `SESSION_SECRET`: secret key used to sign the session cookie.

The Google **Web client ID** is set in code (`src/server/server.js`). Optional: set `GOOGLE_CLIENT_ID` in `.env` to override for local dev.

For GitHub Actions deploy to Cloud Run, set `SESSION_SECRET` and `GCP_SA_KEY` as **Actions → Secrets** (plus `GCP_PROJECT_ID` as secret or variable).

Behavior:

- Unauthenticated users are redirected to `/login`.
- After login, the backend verifies the Google ID token.
- Users are stored in SQLite (`users` table).
- Each player has isolated game progress in `player_game_state` by Google user ID (`google_sub`).
.
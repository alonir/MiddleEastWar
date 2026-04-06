# MiddleEastWar

## Get all modules (install dependencies)

```bash
npm install
```

## Start the server

```bash
GOOGLE_CLIENT_ID="your-google-oauth-client-id" SESSION_SECRET="change-me" npm start
```

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

- `GOOGLE_CLIENT_ID`: Google OAuth client ID used by Google Identity Services.
- `SESSION_SECRET`: secret key used to sign the session cookie.

Behavior:

- Unauthenticated users are redirected to `/login`.
- After login, the backend verifies the Google ID token.
- Users are stored in SQLite (`users` table).
- Each player has isolated game progress in `player_game_state` by Google user ID (`google_sub`).
.
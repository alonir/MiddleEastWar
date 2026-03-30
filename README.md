# MiddleEastWar

## Get all modules (install dependencies)

```bash
npm install
```

## Start the server

```bash
bash scripts/start-server.sh
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


const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { countries, newspaperTranslations } = require('./data');

const SQLITE_DB_PATH = path.join(__dirname, 'game.db.sqlite');
const LEGACY_JSON_DB_PATH = path.join(__dirname, 'game.db.json');

// Initial game state
const DEFAULT_STATE = {
    turn: 1,
    warDeclaredThisTurn: false,
    diplomacy: {
        egypt: 'peace',
        jordan: 'peace',
        turkey: 'peace',
        uae: 'peace',
        lebanon: 'hostile',
        syria: 'hostile',
        iran: 'hostile',
        qatar: 'hostile',
        yemen: 'hostile',
        bahrain: 'hostile',
        saudi_arabia: 'neutral',
        oman: 'neutral',
        kuwait: 'neutral',
        iraq: 'hostile'
    }
};

const sqlite = new Database(SQLITE_DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
        google_sub TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS player_game_state (
        google_sub TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(google_sub) REFERENCES users(google_sub) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
`);

const selectLegacyStateStmt = sqlite.prepare('SELECT value FROM app_state WHERE key = ?');
const upsertUserStmt = sqlite.prepare(`
    INSERT INTO users (google_sub, email, name, picture, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(google_sub) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        updated_at = CURRENT_TIMESTAMP
`);
const selectPlayerStateStmt = sqlite.prepare('SELECT value FROM player_game_state WHERE google_sub = ?');
const upsertPlayerStateStmt = sqlite.prepare(`
    INSERT INTO player_game_state (google_sub, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(google_sub) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
`);

function persistStateForUser(googleSub, state) {
    upsertPlayerStateStmt.run(googleSub, JSON.stringify(state));
}

function seedOrMigrateLegacyGlobalStateIfNeeded() {
    const existing = selectLegacyStateStmt.get('game_state');
    if (existing) return;

    if (fs.existsSync(LEGACY_JSON_DB_PATH)) {
        try {
            const raw = fs.readFileSync(LEGACY_JSON_DB_PATH, 'utf-8');
            const legacyState = JSON.parse(raw);
            sqlite.prepare(`
                INSERT INTO app_state (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run('game_state', JSON.stringify({ ...DEFAULT_STATE, ...legacyState }));
            console.log('Migrated state from game.db.json to SQLite.');
            return;
        } catch (e) {
            console.error('Failed reading legacy game.db.json, using default state.', e);
        }
    }

    sqlite.prepare(`
        INSERT INTO app_state (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run('game_state', JSON.stringify(DEFAULT_STATE));
    console.log('Initialized fresh game state in SQLite.');
}

function getStoredStateForUser(googleSub) {
    const row = selectPlayerStateStmt.get(googleSub);
    if (!row) return { ...DEFAULT_STATE };
    try {
        const parsed = JSON.parse(row.value);
        return { ...DEFAULT_STATE, ...parsed };
    } catch (e) {
        console.error(`Stored SQLite game state is invalid for user ${googleSub}, resetting to default state.`, e);
        persistStateForUser(googleSub, DEFAULT_STATE);
        return { ...DEFAULT_STATE };
    }
}

seedOrMigrateLegacyGlobalStateIfNeeded();

module.exports = {
    getCountries: () => countries,

    upsertUser: (user) => {
        upsertUserStmt.run(user.googleSub, user.email, user.name, user.picture || null);
    },

    getGameState: (googleSub) => {
        const current = getStoredStateForUser(googleSub);
        if (!selectPlayerStateStmt.get(googleSub)) {
            // One-time bootstrap for first login using legacy shared state when present.
            const legacy = selectLegacyStateStmt.get('game_state');
            if (legacy) {
                try {
                    const parsed = JSON.parse(legacy.value);
                    const seeded = { ...DEFAULT_STATE, ...parsed };
                    persistStateForUser(googleSub, seeded);
                    return seeded;
                } catch (_) {
                    // Ignore and return current default.
                }
            }
            persistStateForUser(googleSub, current);
        }
        return current;
    },

    saveGameState: (googleSub, state) => {
        const current = getStoredStateForUser(googleSub);
        // Merge to avoid wiping fields not sent by client
        const merged = { ...current, ...state };
        persistStateForUser(googleSub, merged);
    },

    getNewspaper: () => newspaperTranslations,
    resetGameState: (googleSub) => {
        persistStateForUser(googleSub, DEFAULT_STATE);
        return DEFAULT_STATE;
    }
};

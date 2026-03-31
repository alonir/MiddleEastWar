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
    CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
`);

const selectStateStmt = sqlite.prepare('SELECT value FROM app_state WHERE key = ?');
const upsertStateStmt = sqlite.prepare(`
    INSERT INTO app_state (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

function persistState(state) {
    upsertStateStmt.run('game_state', JSON.stringify(state));
}

function seedOrMigrateStateIfNeeded() {
    const existing = selectStateStmt.get('game_state');
    if (existing) return;

    if (fs.existsSync(LEGACY_JSON_DB_PATH)) {
        try {
            const raw = fs.readFileSync(LEGACY_JSON_DB_PATH, 'utf-8');
            const legacyState = JSON.parse(raw);
            persistState({ ...DEFAULT_STATE, ...legacyState });
            console.log('Migrated state from game.db.json to SQLite.');
            return;
        } catch (e) {
            console.error('Failed reading legacy game.db.json, using default state.', e);
        }
    }

    persistState(DEFAULT_STATE);
    console.log('Initialized fresh game state in SQLite.');
}

function getStoredState() {
    const row = selectStateStmt.get('game_state');
    if (!row) return { ...DEFAULT_STATE };
    try {
        const parsed = JSON.parse(row.value);
        return { ...DEFAULT_STATE, ...parsed };
    } catch (e) {
        console.error('Stored SQLite game state is invalid, resetting to default state.', e);
        persistState(DEFAULT_STATE);
        return { ...DEFAULT_STATE };
    }
}

seedOrMigrateStateIfNeeded();

module.exports = {
    getCountries: () => countries,

    getGameState: () => getStoredState(),

    saveGameState: (state) => {
        const current = getStoredState();
        // Merge to avoid wiping fields not sent by client
        const merged = { ...current, ...state };
        persistState(merged);
    },

    getNewspaper: () => newspaperTranslations,
    resetGameState: () => {
        persistState(DEFAULT_STATE);
        return DEFAULT_STATE;
    }
};

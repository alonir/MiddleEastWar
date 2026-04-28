const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { validateWarRules, readDefaultWarRules } = require('../warengine/war-engine');
const { countries, newspaperTranslations } = require('./data');

const WAR_RULES_APP_STATE_KEY = 'war_engine_rules';

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
        iraq: 'hostile',
        gaza_strip: 'war'
    }
};

const sqlite = new Database(SQLITE_DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
        google_sub TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- One row per signed-in browser/device; game data stays isolated per google_sub in player_game_state.
    CREATE TABLE IF NOT EXISTS active_sessions (
        session_key TEXT PRIMARY KEY,
        google_sub TEXT NOT NULL,
        email TEXT,
        logged_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip TEXT,
        user_agent TEXT,
        FOREIGN KEY(google_sub) REFERENCES users(google_sub) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_active_sessions_google_sub ON active_sessions(google_sub);
    CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen ON active_sessions(last_seen_at);
    CREATE TABLE IF NOT EXISTS auth_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        google_sub TEXT NOT NULL,
        email TEXT,
        event TEXT NOT NULL,
        session_key TEXT,
        ip TEXT,
        user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_auth_audit_google_sub ON auth_audit(google_sub);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_occurred ON auth_audit(occurred_at);
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
    CREATE TABLE IF NOT EXISTS session_revocations (
        session_key TEXT PRIMARY KEY,
        revoked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reason TEXT
    );
    CREATE TABLE IF NOT EXISTS game_parameters (
        param_key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`);

function migrateSchema() {
    const cols = (table) => sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols('users').includes('auth_version')) {
        sqlite.exec('ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0');
    }
    if (!cols('active_sessions').includes('country_code')) {
        sqlite.exec('ALTER TABLE active_sessions ADD COLUMN country_code TEXT');
    }
    if (!cols('auth_audit').includes('country_code')) {
        sqlite.exec('ALTER TABLE auth_audit ADD COLUMN country_code TEXT');
    }
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS session_revocations (
            session_key TEXT PRIMARY KEY,
            revoked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reason TEXT
        );
    `);
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS game_parameters (
            param_key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
}
migrateSchema();

const DEFAULT_GAME_PARAMETERS = [
    {
        param_key: 'idle_logout_minutes',
        value: '60',
        description: 'Automatic sign-out after this many minutes without any server activity (no requests).'
    }
];

const seedGameParamStmt = sqlite.prepare(`
    INSERT OR IGNORE INTO game_parameters (param_key, value, description)
    VALUES (?, ?, ?)
`);
for (const p of DEFAULT_GAME_PARAMETERS) {
    seedGameParamStmt.run(p.param_key, p.value, p.description);
}

const GAME_PARAMETER_EDITABLE_KEYS = new Set(DEFAULT_GAME_PARAMETERS.map((p) => p.param_key));

const listGameParametersStmt = sqlite.prepare(`
    SELECT param_key, value, description, updated_at FROM game_parameters ORDER BY param_key COLLATE NOCASE
`);
const getGameParameterValueStmt = sqlite.prepare('SELECT value FROM game_parameters WHERE param_key = ?');
const updateGameParameterStmt = sqlite.prepare(`
    UPDATE game_parameters SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE param_key = ?
`);

const selectLegacyStateStmt = sqlite.prepare('SELECT value FROM app_state WHERE key = ?');
const upsertAppStateStmt = sqlite.prepare(`
    INSERT INTO app_state (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
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

const insertActiveSessionStmt = sqlite.prepare(`
    INSERT INTO active_sessions (session_key, google_sub, email, ip, user_agent, country_code, logged_in_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const deleteActiveSessionStmt = sqlite.prepare(`
    DELETE FROM active_sessions WHERE session_key = ?
`);

const touchActiveSessionStmt = sqlite.prepare(`
    UPDATE active_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_key = ?
`);

const insertAuthAuditStmt = sqlite.prepare(`
    INSERT INTO auth_audit (google_sub, email, event, session_key, ip, user_agent, country_code)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const selectRevokedSessionStmt = sqlite.prepare('SELECT 1 AS x FROM session_revocations WHERE session_key = ?');
const revokeSessionKeyStmt = sqlite.prepare(`
    INSERT OR REPLACE INTO session_revocations (session_key, reason) VALUES (?, ?)
`);
const getAuthVersionStmt = sqlite.prepare('SELECT COALESCE(auth_version, 0) AS v FROM users WHERE google_sub = ?');
const bumpAuthVersionStmt = sqlite.prepare(`
    UPDATE users SET auth_version = COALESCE(auth_version, 0) + 1 WHERE google_sub = ?
`);
const deleteActiveForUserStmt = sqlite.prepare('DELETE FROM active_sessions WHERE google_sub = ?');

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

function seedWarEngineRulesIfNeeded() {
    const row = selectLegacyStateStmt.get(WAR_RULES_APP_STATE_KEY);
    if (row && row.value) return;
    try {
        const defaults = readDefaultWarRules();
        upsertAppStateStmt.run(WAR_RULES_APP_STATE_KEY, JSON.stringify(defaults));
    } catch (e) {
        console.error('Could not seed war engine rules from war-rules.json:', e);
    }
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
seedWarEngineRulesIfNeeded();

module.exports = {
    getCountries: () => countries,

    upsertUser: (user) => {
        upsertUserStmt.run(user.googleSub, user.email, user.name, user.picture || null);
    },

    getGameState: (googleSub, sessionUser) => {
        if (sessionUser && sessionUser.googleSub === googleSub) {
            upsertUserStmt.run(
                sessionUser.googleSub,
                sessionUser.email,
                sessionUser.name,
                sessionUser.picture || null
            );
        }
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

    saveGameState: (googleSub, state, sessionUser) => {
        if (sessionUser && sessionUser.googleSub === googleSub) {
            upsertUserStmt.run(
                sessionUser.googleSub,
                sessionUser.email,
                sessionUser.name,
                sessionUser.picture || null
            );
        }
        const current = getStoredStateForUser(googleSub);
        // Merge to avoid wiping fields not sent by client
        const merged = { ...current, ...state };
        persistStateForUser(googleSub, merged);
    },

    getNewspaper: () => newspaperTranslations,
    resetGameState: (googleSub, sessionUser) => {
        if (sessionUser && sessionUser.googleSub === googleSub) {
            upsertUserStmt.run(
                sessionUser.googleSub,
                sessionUser.email,
                sessionUser.name,
                sessionUser.picture || null
            );
        }
        persistStateForUser(googleSub, DEFAULT_STATE);
        return DEFAULT_STATE;
    },

    /** New Google sign-in */
    recordLogin: (user, sessionKey, meta) => {
        upsertUserStmt.run(user.googleSub, user.email, user.name, user.picture || null);
        insertActiveSessionStmt.run(
            sessionKey,
            user.googleSub,
            user.email,
            meta?.ip ?? null,
            meta?.userAgent ?? null,
            meta?.countryCode ?? null
        );
        insertAuthAuditStmt.run(
            user.googleSub,
            user.email,
            'login',
            sessionKey,
            meta?.ip ?? null,
            meta?.userAgent ?? null,
            meta?.countryCode ?? null
        );
    },

    /** Signed cookie existed but no server session row yet (e.g. after upgrade or DB reset). */
    attachSession: (user, sessionKey, meta) => {
        upsertUserStmt.run(user.googleSub, user.email, user.name, user.picture || null);
        insertActiveSessionStmt.run(
            sessionKey,
            user.googleSub,
            user.email,
            meta?.ip ?? null,
            meta?.userAgent ?? null,
            meta?.countryCode ?? null
        );
        insertAuthAuditStmt.run(
            user.googleSub,
            user.email,
            'session_attached',
            sessionKey,
            meta?.ip ?? null,
            meta?.userAgent ?? null,
            meta?.countryCode ?? null
        );
    },

    recordLogout: (user, sessionKey, meta, auditEvent = 'logout') => {
        if (sessionKey) {
            deleteActiveSessionStmt.run(sessionKey);
        }
        if (user && user.googleSub) {
            insertAuthAuditStmt.run(
                user.googleSub,
                user.email,
                auditEvent,
                sessionKey || null,
                meta?.ip ?? null,
                meta?.userAgent ?? null,
                meta?.countryCode ?? null
            );
        }
    },

    touchSession: (sessionKey) => {
        if (!sessionKey) return false;
        const result = touchActiveSessionStmt.run(sessionKey);
        return result.changes > 0;
    },

    /** Remove active row only (no audit) — e.g. before replacing session on re-login. */
    removeActiveSessionRow: (sessionKey) => {
        if (sessionKey) deleteActiveSessionStmt.run(sessionKey);
    },

    listActiveSessions: () => sqlite.prepare(`
        SELECT session_key, google_sub, email, logged_in_at, last_seen_at, ip, user_agent, country_code
        FROM active_sessions
        ORDER BY last_seen_at DESC
    `).all(),

    listAuthAudit: (limit = 200) => sqlite.prepare(`
        SELECT id, occurred_at, google_sub, email, event, session_key, ip, user_agent, country_code
        FROM auth_audit
        ORDER BY id DESC
        LIMIT ?
    `).all(limit),

    isSessionRevoked: (sessionKey) => Boolean(sessionKey && selectRevokedSessionStmt.get(sessionKey)),

    getAuthVersion: (googleSub) => {
        if (!googleSub) return 0;
        const row = getAuthVersionStmt.get(googleSub);
        return row ? row.v : 0;
    },

    kickOneSession: (sessionKey, reason = 'admin_kick') => {
        if (!sessionKey) return false;
        revokeSessionKeyStmt.run(sessionKey, reason);
        deleteActiveSessionStmt.run(sessionKey);
        return true;
    },

    kickAllSessionsForUser: (googleSub) => {
        if (!googleSub) return false;
        deleteActiveForUserStmt.run(googleSub);
        bumpAuthVersionStmt.run(googleSub);
        return true;
    },

    listGameParameters: () => listGameParametersStmt.all(),

    /**
     * @param {string} paramKey
     * @param {string} value
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    setGameParameter: (paramKey, value) => {
        if (!paramKey || typeof paramKey !== 'string' || !GAME_PARAMETER_EDITABLE_KEYS.has(paramKey)) {
            return { ok: false, error: 'Unknown or invalid parameter key' };
        }
        if (value === undefined || value === null || String(value).trim() === '') {
            return { ok: false, error: 'Value is required' };
        }
        const str = String(value).trim();
        if (paramKey === 'idle_logout_minutes') {
            const n = parseInt(str, 10);
            if (!Number.isFinite(n) || n < 1 || n > 7 * 24 * 60) {
                return { ok: false, error: 'Idle logout must be between 1 and 10080 minutes (7 days)' };
            }
        }
        const result = updateGameParameterStmt.run(str, paramKey);
        if (result.changes === 0) {
            return { ok: false, error: 'Parameter row missing; restart server to seed defaults' };
        }
        return { ok: true };
    },

    /** Inactivity window for session enforcement (milliseconds). */
    getIdleLogoutMs: () => {
        const row = getGameParameterValueStmt.get('idle_logout_minutes');
        let minutes = parseInt(row?.value, 10);
        if (!Number.isFinite(minutes) || minutes < 1) minutes = 60;
        if (minutes > 7 * 24 * 60) minutes = 7 * 24 * 60;
        return minutes * 60 * 1000;
    },

    getWarEngineRules: () => {
        const row = selectLegacyStateStmt.get(WAR_RULES_APP_STATE_KEY);
        if (!row || !row.value) {
            return readDefaultWarRules();
        }
        try {
            const parsed = JSON.parse(row.value);
            const err = validateWarRules(parsed);
            if (err) {
                console.error('War rules in DB invalid, using file default:', err);
                return readDefaultWarRules();
            }
            return parsed;
        } catch (e) {
            console.error('War rules JSON parse failed, using file default:', e);
            return readDefaultWarRules();
        }
    },

    setWarEngineRules: (rules) => {
        const err = validateWarRules(rules);
        if (err) return { ok: false, error: err };
        upsertAppStateStmt.run(WAR_RULES_APP_STATE_KEY, JSON.stringify(rules));
        return { ok: true };
    },

    resetWarEngineRulesToBundledDefault: () => {
        try {
            const defaults = readDefaultWarRules();
            upsertAppStateStmt.run(WAR_RULES_APP_STATE_KEY, JSON.stringify(defaults));
            return { ok: true, rules: defaults };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    /** Admin dashboard: who has an active session vs all registered players. */
    listAdminDashboard: () => ({
        activeSessions: sqlite.prepare(`
            SELECT a.session_key, a.google_sub, a.email AS session_email, a.logged_in_at, a.last_seen_at,
                   a.ip, a.user_agent, a.country_code, u.name AS user_name
            FROM active_sessions a
            JOIN users u ON u.google_sub = a.google_sub
            ORDER BY a.last_seen_at DESC
        `).all(),
        allUsers: sqlite.prepare(`
            SELECT u.google_sub, u.email, u.name, u.created_at AS user_created_at, u.updated_at AS user_updated_at,
                   COALESCE(u.auth_version, 0) AS auth_version,
                   p.updated_at AS last_game_save_at
            FROM users u
            LEFT JOIN player_game_state p ON p.google_sub = u.google_sub
            ORDER BY u.email COLLATE NOCASE
        `).all()
    })
};

require('dotenv').config();
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const { OAuth2Client } = require('google-auth-library');
const geoip = require('geoip-lite');
const db = require('../db/db');
const { resolveBattle } = require('../warengine/war-engine');

(function installTimestampedConsole() {
    const ts = () => new Date().toISOString();
    for (const name of ['log', 'info', 'warn', 'error', 'debug']) {
        const orig = console[name];
        if (typeof orig !== 'function') continue;
        console[name] = (...args) => orig.apply(console, [`[${ts()}]`, ...args]);
    }
})();

const app = express();
const PORT = process.env.PORT || 3000;

/** OAuth 2.0 Web client ID (public in the browser). Set GOOGLE_CLIENT_ID to override. */
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
    '725887797200-sfdh09dhutqmnfq51t79eibtrl3b77j4.apps.googleusercontent.com';

function parseGoogleClientIds() {
    // Cloud Run (and other GCP) set K_SERVICE; ignore GOOGLE_CLIENT_ID env there so a stale
    // env value cannot override the code default after we fix the client id in source.
    const fromEnv = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const useEnv = fromEnv && !process.env.K_SERVICE;
    const raw = useEnv ? fromEnv : DEFAULT_GOOGLE_WEB_CLIENT_ID;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const WEB_CLIENT_ID_RE = /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;

const googleClientIds = parseGoogleClientIds();
for (const id of googleClientIds) {
    if (!WEB_CLIENT_ID_RE.test(id)) {
        console.error(
            'Invalid GOOGLE_CLIENT_ID. Use the OAuth 2.0 Web client ID from Google Cloud Console '
            + '(APIs & Services → Credentials), e.g. 123456789-xxxxx.apps.googleusercontent.com. '
            + `Got: "${id.substring(0, 40)}${id.length > 40 ? '…' : ''}"`
        );
        process.exit(1);
    }
}
const primaryGoogleClientId = googleClientIds[0] || '';

/** Emails allowed to use /admin (Google SSO must match exactly after sign-in). */
const ADMIN_EMAILS = new Set(['alonir@gmail.com'].map((e) => e.toLowerCase()));

const isProductionLike = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);
const trimmedSession = (process.env.SESSION_SECRET || '').trim();
const SESSION_SECRET = trimmedSession
    || (!isProductionLike
        ? 'local-dev-session-secret-not-for-production'
        : '');
if (!SESSION_SECRET) {
    console.error('SESSION_SECRET is not set. Add it to .env or your hosting env (see .env.example).');
    process.exit(1);
}
if (!trimmedSession && !isProductionLike) {
    console.warn('SESSION_SECRET unset: using a built-in dev default. Set SESSION_SECRET in .env for local sign-in cookies you trust.');
}
const oauthClient = new OAuth2Client(primaryGoogleClientId);

const sessionCookieSecure = process.env.COOKIE_SECURE === 'true'
    ? true
    : process.env.COOKIE_SECURE === 'false'
        ? false
        : process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(cookieSession({
    name: 'session',
    keys: [SESSION_SECRET],
    httpOnly: true,
    sameSite: 'lax',
    secure: sessionCookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000
}));
app.use(express.json());

function normalizeClientIp(ip) {
    if (!ip || typeof ip !== 'string') return null;
    const t = ip.trim();
    if (t.startsWith('::ffff:')) return t.slice(7);
    return t;
}

function getRequestMeta(req) {
    const fwd = req.headers['x-forwarded-for'];
    let ip = req.ip || null;
    if (!ip && typeof fwd === 'string' && fwd.length > 0) {
        ip = fwd.split(',')[0].trim();
    }
    if (!ip && req.socket?.remoteAddress) {
        ip = req.socket.remoteAddress;
    }
    const userAgent = req.headers['user-agent'] || null;
    let countryCode = null;
    const cf = req.headers['cf-ipcountry'];
    if (typeof cf === 'string' && /^[A-Za-z]{2}$/.test(cf.trim())) {
        countryCode = cf.trim().toUpperCase();
    } else {
        const nip = normalizeClientIp(ip);
        if (nip) {
            const geo = geoip.lookup(nip);
            if (geo && geo.country) countryCode = geo.country;
        }
    }
    return { ip, userAgent, countryCode };
}

function sendSessionTerminated(req, res, message) {
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, error: message });
    }
    return res.redirect('/login');
}

/** Idle timeout, revoked session cookie, or auth_version bump (kick-all). */
function enforceSessionRules(req, res, next) {
    // Allow replacing a bad or stale cookie with a fresh Google sign-in.
    if (req.method === 'POST' && req.path === '/api/auth/google') return next();
    if (!req.session?.user) return next();

    const user = req.session.user;
    const sessionKey = req.session.sessionKey;
    const meta = getRequestMeta(req);

    if (sessionKey && db.isSessionRevoked(sessionKey)) {
        db.recordLogout(user, sessionKey, meta, 'session_revoked');
        req.session = null;
        return sendSessionTerminated(req, res, 'Session has been revoked');
    }

    const dbAuthVer = db.getAuthVersion(user.googleSub);
    const sessAuthVer = req.session.authVersion;
    const effectiveVer = typeof sessAuthVer === 'number' ? sessAuthVer : 0;
    if (effectiveVer !== dbAuthVer) {
        db.recordLogout(user, sessionKey, meta, 'auth_invalidate');
        req.session = null;
        return sendSessionTerminated(req, res, 'Session is no longer valid');
    }

    const now = Date.now();
    const last = req.session.lastActivityAt;
    if (typeof last === 'number' && now - last > db.getIdleLogoutMs()) {
        db.recordLogout(user, sessionKey, meta, 'idle_timeout');
        req.session = null;
        return sendSessionTerminated(req, res, 'Session expired (inactive)');
    }

    req.session.lastActivityAt = now;
    return next();
}

/** Keep active_sessions + last_seen in sync with the signed cookie (per-browser session_key). */
function syncSessionPresence(req) {
    if (!req.session || !req.session.user) return;
    const user = req.session.user;
    db.upsertUser(user);
    let sessionKey = req.session.sessionKey;
    const meta = getRequestMeta(req);
    if (!sessionKey) {
        sessionKey = crypto.randomUUID();
        req.session.sessionKey = sessionKey;
        db.attachSession(user, sessionKey, meta);
        return;
    }
    if (!db.touchSession(sessionKey)) {
        sessionKey = crypto.randomUUID();
        req.session.sessionKey = sessionKey;
        db.attachSession(user, sessionKey, meta);
    }
}

app.use(enforceSessionRules);
app.use((req, res, next) => {
    syncSessionPresence(req);
    next();
});

function getPublicUser(sessionUser) {
    if (!sessionUser) return null;
    return {
        googleSub: sessionUser.googleSub,
        email: sessionUser.email,
        name: sessionUser.name,
        picture: sessionUser.picture || null
    };
}

function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    return res.redirect('/login');
}

function requireApiUser(req, res, next) {
    if (req.session?.user) return next();
    return res.status(401).json({ success: false, error: 'Authentication required' });
}

function requireAdmin(req, res, next) {
    const email = (req.session.user.email || '').toLowerCase();
    if (ADMIN_EMAILS.has(email)) return next();
    return res.status(403).json({ success: false, error: 'Administrator access only' });
}

app.get('/healthz', (req, res) => {
    res.json({ ok: true });
});

app.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

app.get('/api/auth/config', (req, res) => {
    res.json({
        success: true,
        googleClientId: primaryGoogleClientId,
        googleSsoConfigured: Boolean(primaryGoogleClientId)
    });
});

app.post('/api/auth/google', async (req, res) => {
    try {
        if (!primaryGoogleClientId) {
            return res.status(500).json({ success: false, error: 'GOOGLE_CLIENT_ID is not configured' });
        }
        const { credential } = req.body || {};
        if (!credential) {
            return res.status(400).json({ success: false, error: 'Missing Google credential token' });
        }

        const audience = googleClientIds.length > 1 ? googleClientIds : primaryGoogleClientId;
        const ticket = await oauthClient.verifyIdToken({
            idToken: credential,
            audience
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.sub || !payload.email) {
            return res.status(401).json({ success: false, error: 'Invalid Google token payload' });
        }

        const user = {
            googleSub: payload.sub,
            email: payload.email,
            name: payload.name || payload.email,
            picture: payload.picture || null
        };
        db.upsertUser(user);
        const priorKey = req.session?.sessionKey;
        if (priorKey) {
            db.removeActiveSessionRow(priorKey);
        }
        const sessionKey = crypto.randomUUID();
        req.session.user = user;
        req.session.sessionKey = sessionKey;
        req.session.authVersion = db.getAuthVersion(user.googleSub);
        req.session.lastActivityAt = Date.now();
        const meta = getRequestMeta(req);
        db.recordLogin(user, sessionKey, meta);
        return res.json({ success: true, user: getPublicUser(user) });
    } catch (e) {
        console.error('Google auth failed:', e);
        return res.status(401).json({ success: false, error: 'Google authentication failed' });
    }
});

app.get('/api/auth/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    return res.json({ success: true, user: getPublicUser(req.session.user) });
});

app.post('/api/auth/logout', (req, res) => {
    const user = req.session?.user ? { ...req.session.user } : null;
    const sessionKey = req.session?.sessionKey;
    db.recordLogout(user, sessionKey, getRequestMeta(req));
    req.session = null;
    res.json({ success: true });
});

// Canonical admin URL is /admin (not /admin.html — that path used to fall through and break API fetches).
app.get(['/admin.html', '/admin/admin.html'], (req, res) => {
    res.redirect(302, '/admin');
});

app.get('/admin', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'admin', 'admin.html'));
});

app.get('/api/admin/config', (req, res) => {
    res.json({
        success: true,
        googleClientId: primaryGoogleClientId,
        googleSsoConfigured: Boolean(primaryGoogleClientId)
    });
});

app.get('/api/admin/me', requireApiUser, requireAdmin, (req, res) => {
    res.json({ success: true, user: getPublicUser(req.session.user) });
});

app.get('/api/admin/players', requireApiUser, requireAdmin, (req, res) => {
    try {
        const data = db.listAdminDashboard();
        res.json({ success: true, ...data });
    } catch (e) {
        console.error('Admin players list failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/admin/kick-session', requireApiUser, requireAdmin, (req, res) => {
    const sessionKey = (req.body && req.body.sessionKey) || '';
    if (!sessionKey || typeof sessionKey !== 'string') {
        return res.status(400).json({ success: false, error: 'sessionKey required' });
    }
    db.kickOneSession(sessionKey, 'admin_kick');
    res.json({ success: true });
});

app.post('/api/admin/kick-user', requireApiUser, requireAdmin, (req, res) => {
    const googleSub = (req.body && req.body.googleSub) || '';
    if (!googleSub || typeof googleSub !== 'string') {
        return res.status(400).json({ success: false, error: 'googleSub required' });
    }
    db.kickAllSessionsForUser(googleSub);
    res.json({ success: true });
});

app.get('/api/admin/game-parameters', requireApiUser, requireAdmin, (req, res) => {
    try {
        const parameters = db.listGameParameters();
        res.json({ success: true, parameters });
    } catch (e) {
        console.error('Admin game-parameters list failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.put('/api/admin/game-parameters', requireApiUser, requireAdmin, (req, res) => {
    const paramKey = req.body && req.body.param_key;
    const value = req.body && req.body.value;
    if (!paramKey || typeof paramKey !== 'string') {
        return res.status(400).json({ success: false, error: 'param_key required' });
    }
    const result = db.setGameParameter(paramKey, value);
    if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, parameters: db.listGameParameters() });
});

function adminRestartAllowed() {
    if (process.env.RESTART_SERVER_DISABLED === 'true') return false;
    if (process.env.K_SERVICE) return false;
    return true;
}

function scheduleProcessRestart(httpSrv) {
    const child = spawn(process.execPath, process.argv.slice(1), {
        cwd: process.cwd(),
        env: process.env,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    child.unref();
    httpSrv.close((closeErr) => {
        if (closeErr) console.error('HTTP server close before restart:', closeErr);
        process.exit(closeErr ? 1 : 0);
    });
}

/** Set in `app.listen` below; used by restart handler. */
let httpServer;

app.post('/api/admin/restart-server', requireApiUser, requireAdmin, (req, res) => {
    if (!adminRestartAllowed()) {
        return res.status(503).json({
            success: false,
            error: 'In-process restart is disabled on this platform (e.g. Cloud Run sets K_SERVICE). Restart the service from your host, or set RESTART_SERVER_DISABLED=false only when running plain Node on a VM or desktop.'
        });
    }
    const scriptArgs = process.argv.slice(1);
    if (scriptArgs.length === 0) {
        return res.status(503).json({
            success: false,
            error: 'Cannot determine script path to respawn (no argv). Start with: node src/server/server.js'
        });
    }
    if (!httpServer) {
        return res.status(503).json({ success: false, error: 'Server is not listening yet' });
    }
    res.json({ success: true, message: 'Server is restarting.' });
    setTimeout(() => {
        try {
            scheduleProcessRestart(httpServer);
        } catch (e) {
            console.error('Restart spawn failed:', e);
            process.exit(1);
        }
    }, 400);
});

app.use(requireAuth);
app.use(express.static(path.join(__dirname, '..'), { index: false }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/api/countries', (req, res) => {
    res.json(db.getCountries());
});

app.get('/api/newspaper', (req, res) => {
    res.json(db.getNewspaper());
});

app.get('/api/game-state', (req, res) => {
    res.json(db.getGameState(req.session.user.googleSub, req.session.user));
});

app.post('/api/save-state', (req, res) => {
    try {
        db.saveGameState(req.session.user.googleSub, req.body, req.session.user);
        res.json({ success: true });
    } catch (e) {
        console.error("Failed to save state:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/reset-state', (req, res) => {
    try {
        const initialState = db.resetGameState(req.session.user.googleSub, req.session.user);
        res.json({ success: true, state: initialState });
    } catch (e) {
        console.error("Failed to reset state:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/resolve-battle', (req, res) => {
    try {
        const result = resolveBattle(req.body || {}, db.getCountries());
        res.json({ success: true, result });
    } catch (e) {
        console.error("Failed to resolve battle:", e);
        res.status(400).json({ success: false, error: e.message });
    }
});

httpServer = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

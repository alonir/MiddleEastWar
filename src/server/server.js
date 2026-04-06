require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const { OAuth2Client } = require('google-auth-library');
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
        req.session.user = user;
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
    req.session = null;
    res.json({ success: true });
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
    res.json(db.getGameState(req.session.user.googleSub));
});

app.post('/api/save-state', (req, res) => {
    try {
        db.saveGameState(req.session.user.googleSub, req.body);
        res.json({ success: true });
    } catch (e) {
        console.error("Failed to save state:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/reset-state', (req, res) => {
    try {
        const initialState = db.resetGameState(req.session.user.googleSub);
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

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db/db');
const { resolveBattle } = require('../warengine/war-engine');

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.set('trust proxy', 1);
app.use(cookieSession({
    name: 'session',
    keys: [SESSION_SECRET],
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

app.get('/api/auth/config', (req, res) => {
    res.json({ success: true, googleClientId: GOOGLE_CLIENT_ID });
});

app.post('/api/auth/google', async (req, res) => {
    try {
        if (!GOOGLE_CLIENT_ID) {
            return res.status(500).json({ success: false, error: 'GOOGLE_CLIENT_ID is not configured' });
        }
        const { credential } = req.body || {};
        if (!credential) {
            return res.status(400).json({ success: false, error: 'Missing Google credential token' });
        }

        const ticket = await oauthClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
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

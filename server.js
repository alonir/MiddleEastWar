const express = require('express');
const path = require('path');
const db = require('./db');
const { resolveBattle } = require('./src/warengine/war-engine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'src')));
app.use(express.json());

app.get('/api/countries', (req, res) => {
    res.json(db.getCountries());
});

app.get('/api/newspaper', (req, res) => {
    res.json(db.getNewspaper());
});

app.get('/api/game-state', (req, res) => {
    res.json(db.getGameState());
});

app.post('/api/save-state', (req, res) => {
    try {
        db.saveGameState(req.body);
        res.json({ success: true });
    } catch (e) {
        console.error("Failed to save state:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/reset-state', (req, res) => {
    try {
        const initialState = db.resetGameState();
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

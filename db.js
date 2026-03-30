const fs = require('fs');
const path = require('path');
const { countries, newspaperTranslations } = require('./data');

const DB_PATH = path.join(__dirname, 'game.db.json');

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

// Load or seed the database file
function loadDb() {
    if (!fs.existsSync(DB_PATH)) {
        console.log('No game.db.json found — creating fresh game state...');
        saveDb(DEFAULT_STATE);
        return DEFAULT_STATE;
    }
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('game.db.json is corrupted — resetting to default state.', e);
        saveDb(DEFAULT_STATE);
        return DEFAULT_STATE;
    }
}

function saveDb(state) {
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

module.exports = {
    getCountries: () => countries,

    getGameState: () => loadDb(),

    saveGameState: (state) => {
        const current = loadDb();
        // Merge to avoid wiping fields not sent by client
        const merged = { ...current, ...state };
        saveDb(merged);
    },

    getNewspaper: () => newspaperTranslations,
    resetGameState: () => {
        saveDb(DEFAULT_STATE);
        return DEFAULT_STATE;
    }
};

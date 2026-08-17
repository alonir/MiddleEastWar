window.onerror = function (msg, url, line, col, error) {
    alert("Error: " + msg + "\nLine: " + line + "\nCol: " + col);
};

// Initialize the map centered on the Middle East
// Coordinates: [Latitude, Longitude]
const middleEastCenter = [30.0, 45.0];
const initialZoom = 5;

const map = L.map('map', {
    center: middleEastCenter,
    zoom: initialZoom,
    zoomControl: false, // We can add custom controls later
    attributionControl: false // Hide default attribution for game feel (add back in credits)
});

// Add Esri World Imagery Layer (Satellite view)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
}).addTo(map);

// Political borders + place labels over imagery (country lines are otherwise hard to see)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    opacity: 0.9,
    attribution: 'Boundaries &copy; Esri'
}).addTo(map);

if (!map.getPane('countryBorderPane')) {
    map.createPane('countryBorderPane');
    map.getPane('countryBorderPane').style.zIndex = 350;
    map.getPane('countryBorderPane').style.pointerEvents = 'none';
}

// Natural Earth ISO_A3 → game country id
const COUNTRY_BORDER_ISO_BY_ID = {
    egypt: 'EGY',
    saudi_arabia: 'SAU',
    iran: 'IRN',
    turkey: 'TUR',
    iraq: 'IRQ',
    yemen: 'YEM',
    syria: 'SYR',
    jordan: 'JOR',
    uae: 'ARE',
    israel: 'ISR',
    lebanon: 'LBN',
    oman: 'OMN',
    kuwait: 'KWT',
    qatar: 'QAT',
    bahrain: 'BHR'
};

// ISO 3166-1 alpha-2 for flagcdn (Gaza uses Palestine)
const COUNTRY_FLAG_CODE = {
    egypt: 'eg',
    saudi_arabia: 'sa',
    iran: 'ir',
    turkey: 'tr',
    iraq: 'iq',
    yemen: 'ye',
    syria: 'sy',
    jordan: 'jo',
    uae: 'ae',
    israel: 'il',
    gaza_strip: 'ps',
    lebanon: 'lb',
    oman: 'om',
    kuwait: 'kw',
    qatar: 'qa',
    bahrain: 'bh'
};

function getCountryFlagHtml(countryId, size = 'sm') {
    const code = COUNTRY_FLAG_CODE[countryId];
    if (!code) return '';
    const widths = { sm: 18, md: 22, lg: 28 };
    const width = widths[size] || widths.sm;
    const height = Math.round(width * 0.75);
    return `<img class="country-flag country-flag-${size}" src="https://flagcdn.com/w40/${code}.png" srcset="https://flagcdn.com/w80/${code}.png 2x" width="${width}" height="${height}" alt="" loading="lazy" decoding="async" draggable="false" />`;
}

/** @type {Record<string, L.Path>} */
const countryBorderLayers = {};

function getCountryBorderStyle(countryId) {
    const diplomacy = gameState?.diplomacy || {};

    // No custom Gaza outline. Skip Israel — its outline overlaps neighbors.
    const atWar = countryId !== 'israel'
        && countryId !== 'gaza_strip'
        && (diplomacy[countryId] || 'neutral') === 'war';

    if (atWar) {
        return {
            color: '#000000',
            weight: 4.5,
            opacity: 1,
            fillColor: '#000000',
            fillOpacity: 0.05,
            interactive: false,
            className: 'country-border country-border-war'
        };
    }

    // Other countries rely on the Esri reference tiles until war
    return {
        color: '#000000',
        weight: 0,
        opacity: 0,
        fillOpacity: 0,
        interactive: false,
        className: 'country-border'
    };
}

function updateCountryBorderStyles() {
    Object.keys(countryBorderLayers).forEach((countryId) => {
        const layer = countryBorderLayers[countryId];
        if (layer && layer.setStyle) {
            layer.setStyle(getCountryBorderStyle(countryId));
        }
    });
}

function registerCountryBorderLayer(countryId, layer) {
    countryBorderLayers[countryId] = layer;
    layer.setStyle(getCountryBorderStyle(countryId));
}

async function loadCountryBorderOutlines() {
    const isoToId = Object.fromEntries(
        Object.entries(COUNTRY_BORDER_ISO_BY_ID).map(([id, iso]) => [iso, id])
    );

    try {
        const resp = await fetch(
            'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
        );
        if (!resp.ok) throw new Error(`borders HTTP ${resp.status}`);
        const geojson = await resp.json();

        L.geoJSON(geojson, {
            pane: 'countryBorderPane',
            filter: (feature) => {
                const iso = feature?.properties?.ISO_A3 || feature?.properties?.ADM0_A3;
                return Boolean(isoToId[iso]);
            },
            style: () => ({ weight: 0, opacity: 0, fillOpacity: 0 }),
            onEachFeature: (feature, layer) => {
                const iso = feature?.properties?.ISO_A3 || feature?.properties?.ADM0_A3;
                const countryId = isoToId[iso];
                if (!countryId) return;
                registerCountryBorderLayer(countryId, layer);
            }
        }).addTo(map);

        updateCountryBorderStyles();
    } catch (err) {
        console.warn('Could not load country border outlines; Gaza outline still available.', err);
    }
}

// Custom Middle East Country Labels
// Data is approximate for game purposes
const countries = [
    {
        id: "egypt",
        coords: [26.8206, 30.8025],
        name: { en: "Egypt", he: "מצרים", ar: "مصر" },
        stats: {
            pop: { en: "111M", he: "111M", ar: "111M" },
            army_regular: { en: "438k", he: "438k", ar: "438k" },
            army_reserves: { en: "479k", he: "479k", ar: "479k" },
            tanks: { en: "4,664", he: "4,664", ar: "4,664" },
            aircraft: { en: "1,062", he: "1,062", ar: "1,062" },
            navy: { en: "245", he: "245", ar: "245" },
            submarines: { en: "8", he: "8", ar: "8" }
        }
    },
    {
        id: "saudi_arabia",
        coords: [23.8859, 45.0792],
        name: { en: "Saudi Arabia", he: "ערב הסעודית", ar: "السعودية" },
        stats: {
            pop: { en: "36M", he: "36M", ar: "36M" },
            army_regular: { en: "257k", he: "257k", ar: "257k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "1,273", he: "1,273", ar: "1,273" },
            aircraft: { en: "897", he: "897", ar: "897" },
            navy: { en: "55", he: "55", ar: "55" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "iran",
        coords: [32.4279, 53.6880],
        name: { en: "Iran", he: "איראן", ar: "إيران" },
        stats: {
            pop: { en: "88M", he: "88M", ar: "88M" },
            army_regular: { en: "610k", he: "610k", ar: "610k" },
            army_reserves: { en: "350k", he: "350k", ar: "350k" },
            tanks: { en: "4,071", he: "4,071", ar: "4,071" },
            aircraft: { en: "541", he: "541", ar: "541" },
            navy: { en: "101", he: "101", ar: "101" },
            submarines: { en: "19", he: "19", ar: "19" }
        }
    },
    {
        id: "turkey",
        coords: [38.9637, 35.2433],
        name: { en: "Turkey", he: "טורקיה", ar: "تركيا" },
        stats: {
            pop: { en: "85M", he: "85M", ar: "85M" },
            army_regular: { en: "355k", he: "355k", ar: "355k" },
            army_reserves: { en: "378k", he: "378k", ar: "378k" },
            tanks: { en: "2,229", he: "2,229", ar: "2,229" },
            aircraft: { en: "1,057", he: "1,057", ar: "1,057" },
            navy: { en: "154", he: "154", ar: "154" },
            submarines: { en: "12", he: "12", ar: "12" }
        }
    },
    {
        id: "iraq",
        coords: [33.2232, 43.6793],
        name: { en: "Iraq", he: "עיראק", ar: "العراق" },
        stats: {
            pop: { en: "44M", he: "44M", ar: "44M" },
            army_regular: { en: "193k", he: "193k", ar: "193k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "848", he: "848", ar: "848" },
            aircraft: { en: "361", he: "361", ar: "361" },
            navy: { en: "60", he: "60", ar: "60" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "yemen",
        coords: [15.5527, 48.5164],
        name: { en: "Yemen", he: "תימן", ar: "اليمن" },
        stats: {
            pop: { en: "33M", he: "33M", ar: "33M" },
            army_regular: { en: "40k", he: "40k", ar: "40k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "30", he: "30", ar: "30" },
            aircraft: { en: "10", he: "10", ar: "10" },
            navy: { en: "30", he: "30", ar: "30" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "syria",
        coords: [34.8021, 38.9968],
        name: { en: "Syria", he: "סוריה", ar: "سوريا" },
        stats: {
            pop: { en: "22M", he: "22M", ar: "22M" },
            army_regular: { en: "100k", he: "100k", ar: "100k" },
            army_reserves: { en: "50k", he: "50k", ar: "50k" },
            tanks: { en: "2,000", he: "2,000", ar: "2,000" },
            aircraft: { en: "450", he: "450", ar: "450" },
            navy: { en: "56", he: "56", ar: "56" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "jordan",
        coords: [30.5852, 36.2384],
        name: { en: "Jordan", he: "ירדן", ar: "الأردن" },
        stats: {
            pop: { en: "11M", he: "11M", ar: "11M" },
            army_regular: { en: "100k", he: "100k", ar: "100k" },
            army_reserves: { en: "65k", he: "65k", ar: "65k" },
            tanks: { en: "1,300", he: "1,300", ar: "1,300" },
            aircraft: { en: "260", he: "260", ar: "260" },
            navy: { en: "27", he: "27", ar: "27" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "uae",
        coords: [23.4241, 53.8478],
        name: { en: "UAE", he: "איחוד האמירויות", ar: "האמירויות" }, // Arabic correction: الإمارات
        stats: {
            pop: { en: "9M", he: "9M", ar: "9M" },
            army_regular: { en: "65k", he: "65k", ar: "65k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "350", he: "350", ar: "350" },
            aircraft: { en: "538", he: "538", ar: "538" },
            navy: { en: "75", he: "75", ar: "75" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "israel",
        coords: [31.0461, 34.8516],
        name: { en: "Israel", he: "ישראל", ar: "إسرائيل" },
        stats: {
            pop: { en: "9.5M", he: "9.5M", ar: "9.5M" },
            army_regular: { en: "169k", he: "169k", ar: "169k" },
            army_reserves: { en: "465k", he: "465k", ar: "465k" },
            tanks: { en: "2,200", he: "2,200", ar: "2,200" },
            aircraft: { en: "601", he: "601", ar: "601" },
            navy: { en: "67", he: "67", ar: "67" },
            submarines: { en: "5", he: "5", ar: "5" }
        }
    },
    {
        id: "gaza_strip",
        coords: [31.3547, 34.3082],
        name: { en: "Gaza Strip", he: "רצועת עזה", ar: "قطاع غزة" },
        stats: {
            pop: { en: "2.3M", he: "2.3M", ar: "2.3M" },
            army_regular: { en: "40k", he: "40k", ar: "40k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "0", he: "0", ar: "0" },
            aircraft: { en: "0", he: "0", ar: "0" },
            navy: { en: "0", he: "0", ar: "0" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "lebanon",
        coords: [33.8547, 35.8623],
        name: { en: "Lebanon", he: "לבנון", ar: "لبنان" },
        stats: {
            pop: { en: "5.5M", he: "5.5M", ar: "5.5M" },
            army_regular: { en: "60k", he: "60k", ar: "60k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "200", he: "200", ar: "200" },
            aircraft: { en: "70", he: "70", ar: "70" },
            navy: { en: "50", he: "50", ar: "50" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "oman",
        coords: [21.4735, 55.9754],
        name: { en: "Oman", he: "עומאן", ar: "عمان" },
        stats: {
            pop: { en: "5M", he: "5M", ar: "5M" },
            army_regular: { en: "42k", he: "42k", ar: "42k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "117", he: "117", ar: "117" },
            aircraft: { en: "128", he: "128", ar: "128" },
            navy: { en: "16", he: "16", ar: "16" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "kuwait",
        coords: [29.3117, 47.4818],
        name: { en: "Kuwait", he: "כווית", ar: "الكويت" },
        stats: {
            pop: { en: "4.3M", he: "4.3M", ar: "4.3M" },
            army_regular: { en: "17k", he: "17k", ar: "17k" },
            army_reserves: { en: "24k", he: "24k", ar: "24k" },
            tanks: { en: "368", he: "368", ar: "368" },
            aircraft: { en: "85", he: "85", ar: "85" },
            navy: { en: "38", he: "38", ar: "38" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "qatar",
        coords: [25.3548, 51.1839],
        name: { en: "Qatar", he: "קטאר", ar: "قطر" },
        stats: {
            pop: { en: "2.7M", he: "2.7M", ar: "2.7M" },
            army_regular: { en: "12k", he: "12k", ar: "12k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "90", he: "90", ar: "90" },
            aircraft: { en: "198", he: "198", ar: "198" },
            navy: { en: "80", he: "80", ar: "80" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "bahrain",
        coords: [26.0667, 50.5577],
        name: { en: "Bahrain", he: "בחריין", ar: "البحرين" },
        stats: {
            pop: { en: "1.5M", he: "1.5M", ar: "1.5M" },
            army_regular: { en: "8k", he: "8k", ar: "8k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "180", he: "180", ar: "180" },
            aircraft: { en: "110", he: "110", ar: "110" },
            navy: { en: "39", he: "39", ar: "39" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    }
];

// Fix UAE Arabic name manually if needed, but let's proceed
countries.find(c => c.id === 'uae').name.ar = "الإمارات";

// Newspaper Translations
const newspaperTranslations = {
    en: {
        header: "The New York Times",
        date: "OCTOBER 7, 2023",
        headline: "ISRAEL UNDER ATTACK",
        subhead: "HAMAS LAUNCHES SURPRISE ASSAULT",
        body: `
            <p>In a sudden and unprecedented escalation, Hamas militants have launched a massive surprise attack on
            Israel from the Gaza Strip. Thousands of rockets have been fired, and ground incursions are reported
            in southern Israeli communities.</p>
            <p>The Israeli government has declared a state of war as the IDF mobilizes reserves to respond to the
            crisis.</p>
        `
    },
    he: {
        header: "ידיעות אחרונות",
        date: "7 באוקטובר 2023",
        headline: "ישראל תחת מתקפה",
        subhead: "חמאס פתח במתקפת פתע",
        body: `
            <p>בהסלמה פתאומית וחסרת תקדים, מחבלי חמאס פתחו במתקפת פתע מסיבית על
            ישראל מרצועת עזה. אלפי רקטות נורו, ודווח על חדירות קרקעיות
            ביישובי הדרום.</p>
            <p>ממשלת ישראל הכריזה על מצב מלחמה בעוד צה"ל מגייס מילואים להגיב ל
            משבר.</p>
        `
    },
    ar: {
        header: "الشرق الأوسط", // Geographic neutral name or generic
        date: "7 أكتوبر 2023",
        headline: "إسرائيل تحت الهجوم",
        subhead: "حماس تشن هجوماً مفاجئاً",
        body: `
            <p>في تصعيد مفاجئ وغير مسبوق، شن مسلحو حماس هجوماً مفاجئاً واسع النطاق على
            إسرائيل من قطاع غزة. تم إطلاق آلاف الصواريخ، وتم الإبلاغ عن توغلات برية
            في المجتمعات الإسرائيلية الجنوبية.</p>
            <p>أعلنت الحكومة الإسرائيلية حالة الحرب بينما يقوم الجيش الإسرائيلي بتعبئة الاحتياطيات للرد على
            الأزمة.</p>
        `
    }
};

let currentLanguage = 'he';
let markers = [];
let warArrowLayers = [];
let currentUser = null;

const translations = {
    en: { pop: "Pop", army_reg: "Regular Army", army_res: "Reserves", tanks: "Tanks", aircraft: "Aircraft", navy: "Navy", subs: "Submarines", restart: "Restart Game" },
    he: { pop: "אוכלוסייה", army_reg: "צבא סדיר", army_res: "מילואים", tanks: "טנקים", aircraft: "מטוסים", navy: "חיל הים", subs: "צוללות", restart: "אפס משחק" },
    ar: { pop: "السكان", army_reg: "الجيش النظامي", army_res: "الاحتياط", tanks: "دبابات", aircraft: "طائرات", navy: "البحرية", subs: "غواصات", restart: "إعادة تعيين" }
};

// --- Game State (loaded from server on boot) ---
let gameState = {
    turn: 1,
    warDeclaredThisTurn: false,
    diplomacy: {}
};
let dynamicStrengthByCountry = {};

loadCountryBorderOutlines();

function getCountryStrength(countryId, diplomacyStatus) {
    if (dynamicStrengthByCountry[countryId] !== undefined) {
        return dynamicStrengthByCountry[countryId];
    }
    if (countryId === 'israel') return 100;
    if (diplomacyStatus === 'peace') return 100;
    if (diplomacyStatus === 'conquered') return 0;
    if (diplomacyStatus === 'war') return 25;
    if (diplomacyStatus === 'hostile') return 45;
    return 70; // neutral/default
}

const withCredentials = { credentials: 'include' };

function goToLoginIfUnauthorized(response) {
    if (response.status === 401) {
        window.location.href = '/login';
        return true;
    }
    return false;
}

function saveState() {
    fetch('/api/save-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameState),
        ...withCredentials
    })
        .then((response) => {
            if (goToLoginIfUnauthorized(response)) return;
            if (!response.ok) console.error('Failed to save state:', response.status);
        })
        .catch((err) => console.error('Failed to save state:', err));
}

async function isAppServerReachable() {
    try {
        const response = await fetch('/api/auth/config', withCredentials);
        if (!response.ok) return false;
        const payload = await response.json();
        return Boolean(payload && payload.success);
    } catch {
        return false;
    }
}

async function loadCurrentUser() {
    const response = await fetch('/api/auth/me', withCredentials);
    if (!response.ok) {
        throw new Error('Not authenticated');
    }
    const payload = await response.json();
    currentUser = payload.user;
    const playerNameEl = document.getElementById('player-name');
    if (playerNameEl && currentUser) {
        playerNameEl.textContent = currentUser.name || currentUser.email;
    }
}

function loadGoogleIdentityScript() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const src = 'https://accounts.google.com/gsi/client';
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Google script load error')));
            return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Google script load error'));
        document.head.appendChild(s);
    });
}

async function logout() {
    try {
        await loadGoogleIdentityScript();
        window.google?.accounts?.id?.disableAutoSelect();
    } catch (_) {
        // GIS optional; server session logout still applies.
    }
    try {
        await fetch('/api/auth/logout', { method: 'POST', ...withCredentials });
    } catch (_) {
        // Ignore network errors and continue navigation.
    }
    window.location.href = '/login';
}

function endTurn() {
    gameState.turn++;
    gameState.warDeclaredThisTurn = false;
    scheduleCloseContextMenu();
    console.log(`Turn ended. Now turn ${gameState.turn}`);
    saveState();
    renderCountryList();
    checkWinCondition();
}

function checkWinCondition() {
    const nonAllied = countries.filter(c => c.id !== 'israel' && gameState.diplomacy[c.id] !== 'peace' && gameState.diplomacy[c.id] !== 'conquered');
    if (nonAllied.length === 0) {
        alert("You have won the game! Peace or conquest has been achieved across the Middle East.");
    }
}
// ------------------

async function refreshWarStrengths() {
    const warCountries = countries.filter(
        c => c.id !== 'israel' && (gameState.diplomacy[c.id] || 'neutral') === 'war'
    );

    if (warCountries.length === 0) {
        if (Object.keys(dynamicStrengthByCountry).length > 0) {
            dynamicStrengthByCountry = {};
            updateLabels(false);
        }
        return;
    }

    const nextStrengths = {};
    const israelWarPcts = [];

    await Promise.all(warCountries.map(async (country) => {
        try {
            const response = await fetch('/api/resolve-battle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attackerId: 'israel',
                    defenderId: country.id,
                    startedBy: 'israel'
                }),
                ...withCredentials
            });
            if (goToLoginIfUnauthorized(response)) return;
            const payload = await response.json();
            if (!response.ok || !payload.success || !payload.result) return;

            const attackerScore = Number(payload.result.attacker.score) || 0;
            const defenderScore = Number(payload.result.defender.score) || 0;
            const total = attackerScore + defenderScore;
            const attackerPct = total > 0 ? Number(((attackerScore / total) * 100).toFixed(1)) : 50;
            const defenderPct = total > 0 ? Number(((defenderScore / total) * 100).toFixed(1)) : 50;

            israelWarPcts.push(attackerPct);
            nextStrengths[country.id] = defenderPct;
        } catch (err) {
            // Keep fallback status-based strength for this country on transient failures.
        }
    }));

    if (israelWarPcts.length > 0) {
        const avg = israelWarPcts.reduce((sum, val) => sum + val, 0) / israelWarPcts.length;
        nextStrengths.israel = Number(avg.toFixed(1));
    }

    if (JSON.stringify(nextStrengths) !== JSON.stringify(dynamicStrengthByCountry)) {
        dynamicStrengthByCountry = nextStrengths;
        updateLabels(false);
    }
}

function clearWarArrows() {
    warArrowLayers.forEach((layer) => {
        try {
            map.removeLayer(layer);
        } catch (_) {
            // Layer may already be gone.
        }
    });
    warArrowLayers = [];
}

/**
 * Ballistic centerline in layer pixels.
 * Lateral offset is always measured in the fixed Israel→opponent frame so
 * blue/red volleys can sit on opposite sides of the same corridor.
 */
function sampleBallisticCenterline(fromCoords, toCoords, sideOffsetPx, peakHeightPx, endInsetPx, samples, sideAxisFrom, sideAxisTo) {
    const p1 = map.latLngToLayerPoint(fromCoords);
    const p2 = map.latLngToLayerPoint(toCoords);
    const axisFrom = map.latLngToLayerPoint(sideAxisFrom || fromCoords);
    const axisTo = map.latLngToLayerPoint(sideAxisTo || toCoords);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    const adx = axisTo.x - axisFrom.x;
    const ady = axisTo.y - axisFrom.y;
    const aLen = Math.sqrt(adx * adx + ady * ady) || 1;
    // Fixed left-hand perpendicular of Israel→opponent
    const px = -ady / aLen;
    const py = adx / aLen;

    const inset = Math.min(endInsetPx, len * 0.28);
    const usable = Math.max(len - inset * 2, 10);

    const points = [];
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const along = inset + usable * t;
        const lift = Math.sin(Math.PI * t) * peakHeightPx;
        points.push(L.point(
            p1.x + ux * along + px * sideOffsetPx,
            p1.y + uy * along + py * sideOffsetPx - lift
        ));
    }
    return points;
}

/**
 * Arrow body size in screen pixels. Stays compact at the default view (and when
 * zoomed out); only enlarges once the user zooms in past initialZoom.
 */
function getWarArrowPixelScale() {
    const delta = map.getZoom() - initialZoom;
    if (delta <= 0) {
        return Math.max(0.65, Math.pow(1.2, delta));
    }
    return Math.min(2.2, Math.pow(1.32, delta));
}

/**
 * Filled curved arrow silhouette (like the reference icon):
 * thick arc shaft, tapered tail, solid triangular head.
 */
function buildFilledCurvedArrowLatLngs(centerline, shaftHalfWidth, headLength, headHalfWidth) {
    if (centerline.length < 4) return [];

    const left = [];
    const right = [];
    const headStartIndex = Math.max(1, centerline.length - 4);

    for (let i = 0; i < centerline.length; i++) {
        const prev = centerline[Math.max(0, i - 1)];
        const next = centerline[Math.min(centerline.length - 1, i + 1)];
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const tLen = Math.sqrt(tx * tx + ty * ty) || 1;
        const nx = -ty / tLen;
        const ny = tx / tLen;

        const t = i / (centerline.length - 1);
        let halfW = shaftHalfWidth;
        if (t < 0.12) {
            halfW = shaftHalfWidth * (t / 0.12);
        } else if (i >= headStartIndex) {
            halfW = shaftHalfWidth * 0.92;
        }

        const p = centerline[i];
        left.push(L.point(p.x + nx * halfW, p.y + ny * halfW));
        right.push(L.point(p.x - nx * halfW, p.y - ny * halfW));
    }

    const tip = centerline[centerline.length - 1];
    const before = centerline[Math.max(0, centerline.length - 3)];
    const fdx = tip.x - before.x;
    const fdy = tip.y - before.y;
    const fLen = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
    const fx = fdx / fLen;
    const fy = fdy / fLen;
    const nx = -fy;
    const ny = fx;

    const neck = L.point(tip.x - fx * headLength, tip.y - fy * headLength);
    const headLeft = L.point(neck.x + nx * headHalfWidth, neck.y + ny * headHalfWidth);
    const headRight = L.point(neck.x - nx * headHalfWidth, neck.y - ny * headHalfWidth);
    const headTip = L.point(tip.x + fx * (headLength * 0.15), tip.y + fy * (headLength * 0.15));

    const outline = [
        ...left.slice(0, headStartIndex),
        headLeft,
        headTip,
        headRight,
        ...right.slice(0, headStartIndex).reverse()
    ];

    return outline.map((pt) => map.layerPointToLatLng(pt));
}

function addFilledCurvedWarArrow(fromCoords, toCoords, {
    sideOffsetPx,
    peakHeightPx,
    color,
    shadowColor,
    sideAxisFrom,
    sideAxisTo
}) {
    const s = getWarArrowPixelScale();
    const endInsetPx = Math.round(18 * Math.min(1.15, 0.85 + s * 0.3));
    const samples = 28;

    const centerline = sampleBallisticCenterline(
        fromCoords,
        toCoords,
        sideOffsetPx,
        peakHeightPx,
        endInsetPx,
        samples,
        sideAxisFrom,
        sideAxisTo
    );
    const shaftHalfWidth = 2.6 * s;
    const headLength = 9 * s;
    const headHalfWidth = 5.5 * s;
    const strokeWeight = Math.max(0.8, 1.1 * s);

    const shape = buildFilledCurvedArrowLatLngs(centerline, shaftHalfWidth, headLength, headHalfWidth);
    if (shape.length < 6) return;

    const shadowCenter = sampleBallisticCenterline(
        fromCoords,
        toCoords,
        sideOffsetPx + 1.2 * s,
        Math.max(4 * s, peakHeightPx - 6 * s),
        endInsetPx,
        samples,
        sideAxisFrom,
        sideAxisTo
    );
    const shadowShape = buildFilledCurvedArrowLatLngs(
        shadowCenter,
        shaftHalfWidth + 0.6 * s,
        headLength,
        headHalfWidth + 0.6 * s
    );
    if (shadowShape.length >= 6) {
        const shadow = L.polygon(shadowShape, {
            color: shadowColor,
            fillColor: shadowColor,
            weight: 0,
            fillOpacity: 0.28,
            interactive: false,
            pane: 'warArrowPane'
        }).addTo(map);
        warArrowLayers.push(shadow);
    }

    const arrow = L.polygon(shape, {
        color: '#ffffff',
        fillColor: color,
        weight: strokeWeight,
        opacity: 1,
        fillOpacity: 1,
        lineJoin: 'round',
        interactive: false,
        className: 'war-curved-arrow',
        pane: 'warArrowPane'
    }).addTo(map);

    const highlightPts = centerline
        .slice(0, Math.max(2, centerline.length - 3))
        .map((p, i, arr) => {
            const prev = arr[Math.max(0, i - 1)];
            const next = arr[Math.min(arr.length - 1, i + 1)];
            const tx = next.x - prev.x;
            const ty = next.y - prev.y;
            const tLen = Math.sqrt(tx * tx + ty * ty) || 1;
            const nx = -ty / tLen;
            const ny = tx / tLen;
            return map.layerPointToLatLng(L.point(
                p.x + nx * (shaftHalfWidth * 0.35),
                p.y + ny * (shaftHalfWidth * 0.35) - 0.5 * s
            ));
        });

    const highlight = L.polyline(highlightPts, {
        color: '#ffffff',
        weight: Math.max(0.6, 0.85 * s),
        opacity: 0.4,
        lineCap: 'round',
        interactive: false,
        pane: 'warArrowPane'
    }).addTo(map);

    warArrowLayers.push(arrow, highlight);
}

/**
 * Three arrows on one side of the Israel↔opponent corridor.
 * sideSign +1 = blue (Israel attacks), -1 = red (opponent attacks).
 */
function addDirectedWarArrowVolley(fromCoords, toCoords, {
    color,
    shadowColor,
    sideSign,
    sideAxisFrom,
    sideAxisTo
}) {
    const s = getWarArrowPixelScale();
    const axisFrom = map.latLngToLayerPoint(sideAxisFrom);
    const axisTo = map.latLngToLayerPoint(sideAxisTo);
    const dist = Math.sqrt((axisTo.x - axisFrom.x) ** 2 + (axisTo.y - axisFrom.y) ** 2) || 1;
    const heightScale = Math.min(1.35, Math.max(0.55, dist / 150));
    // Keep a clear gap between blue and red banks, even on short links (e.g. Gaza)
    const laneGap = Math.max(8 * s, Math.min(14 * s, dist * 0.07));
    const bankCenter = Math.max(16 * s, Math.min(28 * s, dist * 0.12));

    const lanes = [
        { side: sideSign * (bankCenter - laneGap), peak: 22 * s * heightScale },
        { side: sideSign * bankCenter, peak: 34 * s * heightScale },
        { side: sideSign * (bankCenter + laneGap), peak: 22 * s * heightScale }
    ];

    lanes.forEach((lane) => {
        addFilledCurvedWarArrow(fromCoords, toCoords, {
            sideOffsetPx: lane.side,
            peakHeightPx: lane.peak,
            color,
            shadowColor,
            sideAxisFrom,
            sideAxisTo
        });
    });
}

function ensureWarArrowPane() {
    if (!map.getPane('warArrowPane')) {
        map.createPane('warArrowPane');
        map.getPane('warArrowPane').style.zIndex = 450; // above overlay, below tooltips/markers
        map.getPane('warArrowPane').style.pointerEvents = 'none';
    }
}

function updateWarArrows() {
    clearWarArrows();
    ensureWarArrowPane();
    updateCountryBorderStyles();

    const israel = countries.find((c) => c.id === 'israel');
    if (!israel || !gameState.diplomacy) return;

    countries.forEach((country) => {
        if (country.id === 'israel') return;
        if ((gameState.diplomacy[country.id] || 'neutral') !== 'war') return;

        const axis = { sideAxisFrom: israel.coords, sideAxisTo: country.coords };

        // Red first (opponent → Israel) on the negative side of the corridor
        addDirectedWarArrowVolley(country.coords, israel.coords, {
            color: '#dc2626',
            shadowColor: '#000000',
            sideSign: -1,
            ...axis
        });

        // Blue on top / beside (Israel → opponent) on the positive side
        addDirectedWarArrowVolley(israel.coords, country.coords, {
            color: '#1d4ed8',
            shadowColor: '#000000',
            sideSign: +1,
            ...axis
        });
    });
}

function updateLabels(shouldRefreshStrengths = true) {
    // Remove existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    clearWarArrows();

    updateNewspaper();
    renderCountryList();

    const isRTL = currentLanguage === 'he' || currentLanguage === 'ar';
    const labels = translations[currentLanguage];

    countries.forEach(country => {
        const isIsrael = country.id === 'israel';
        const diplomacyStatus = gameState.diplomacy[country.id] || 'neutral';
        
        let displayStatus = '';
        if (diplomacyStatus === 'peace' && !isIsrael) {
            displayStatus = '<span class="peace-icon">🤝</span>';
        } else if (diplomacyStatus === 'war' && !isIsrael) {
            displayStatus = '<span class="hostile-icon" style="font-size: 16px;">⚔️</span>';
        } else if (diplomacyStatus === 'hostile' && !isIsrael) {
            displayStatus = '<span class="hostile-icon">🔥</span>';
        } else if (diplomacyStatus === 'neutral' && !isIsrael) {
            displayStatus = '<span class="neutral-icon">❌</span>';
        }

        const strength = getCountryStrength(country.id, diplomacyStatus);
        let color = '#f44336'; // red
        if (strength > 80) color = '#4CAF50'; // green
        else if (strength > 30) color = '#FFEB3B'; // yellow

        const flagHtml = getCountryFlagHtml(country.id, 'sm');
        const htmlContent = `
            <div class="country-marker-container">
                <div class="country-strength-wrapper">
                    <div class="country-strength-bar">
                        <div class="country-strength-fill" style="width: ${strength}%; background-color: ${color};"></div>
                    </div>
                    <span class="country-strength-text">${strength}%</span>
                </div>
                <div class="country-name-with-status">
                    ${flagHtml}<span>${country.name[currentLanguage]}</span> ${displayStatus}
                </div>
            </div>
        `;

        const marker = L.marker(country.coords, {
            icon: L.divIcon({
                className: 'country-label',
                html: htmlContent,
                iconSize: [140, 44],
                iconAnchor: [70, 22]
            })
        }).addTo(map);

        // Add tooltip with stats
        const tooltipContent = `
            <div class="${isRTL ? 'rtl' : ''}" style="text-align: ${isRTL ? 'right' : 'left'};">
                <strong>${getCountryFlagHtml(country.id, 'sm')} ${country.name[currentLanguage]}</strong><br>
                ${labels.pop}: <strong>${country.stats.pop[currentLanguage]}</strong><br>
                ${labels.army_reg}: <strong>${country.stats.army_regular[currentLanguage]}</strong><br>
                ${labels.army_res}: <strong>${country.stats.army_reserves[currentLanguage]}</strong><br>
                ${labels.tanks}: <strong>${country.stats.tanks[currentLanguage]}</strong><br>
                ${labels.aircraft}: <strong>${country.stats.aircraft[currentLanguage]}</strong><br>
                ${labels.navy}: <strong>${country.stats.navy[currentLanguage]}</strong><br>
                ${labels.subs}: <strong>${country.stats.submarines[currentLanguage]}</strong>
            </div>
        `;

        marker.bindTooltip(tooltipContent, {
            permanent: false,
            direction: 'top',
            className: 'stats-tooltip',
            opacity: 1
        });

        markers.push(marker);

        marker.on('click', (event) => {
            const target = event?.originalEvent?.target;
            const hitName = target && target.closest?.('.country-name-with-status');
            if (!hitName) return;
            if (event.originalEvent) {
                L.DomEvent.stopPropagation(event.originalEvent);
            }
            focusCountryOnMap(country);
        });
    });

    updateWarArrows();

    if (shouldRefreshStrengths) {
        refreshWarStrengths();
    }

    const diplomacyPanelEl = document.getElementById('israel-diplomacy-panel');
    if (diplomacyPanelEl && diplomacyPanelEl.classList.contains('visible')) {
        renderIsraelDiplomacyPanel();
    }
}

function updateNewspaper() {
    const content = newspaperTranslations[currentLanguage];
    const isRTL = currentLanguage === 'he' || currentLanguage === 'ar';

    const newspaperContent = document.querySelector('.newspaper-content');
    if (newspaperContent) {
        newspaperContent.style.direction = isRTL ? 'rtl' : 'ltr';
        newspaperContent.style.fontFamily = currentLanguage === 'en' ? "'Times New Roman', Times, serif" : "'Arial', sans-serif"; // Simple fallback for Hebrew/Arabic
    }

    document.querySelector('.newspaper-header').textContent = content.header;
    document.querySelector('.newspaper-date').textContent = content.date;
    document.querySelector('.newspaper-headline').textContent = content.headline;
    document.querySelector('.newspaper-subhead').textContent = content.subhead;
    document.querySelector('.newspaper-body').innerHTML = content.body;
}

// Initialize labels
updateLabels();

// Language Selector Event Listener
document.getElementById('language-selector').addEventListener('change', (e) => {
    currentLanguage = e.target.value;
    updateLabels();
});

// Newspaper Overlay Logic
document.getElementById('close-newspaper').addEventListener('click', function () {
    document.getElementById('newspaper-overlay').style.display = 'none';
});

// --- Country List Panel & Action Modal Logic ---
function renderCountryList() {
    const listEl = document.getElementById('country-list');
    const panelTitle = document.getElementById('panel-title');
    const turnDisplay = document.getElementById('turn-display');
    const endTurnBtn = document.getElementById('end-turn-btn');
    const restartGameBtn = document.getElementById('restart-game-btn');
    listEl.innerHTML = '';
    // End turn is only allowed after the player performs an action this turn.
    endTurnBtn.disabled = !gameState.warDeclaredThisTurn;
    
    if (currentLanguage === 'he') {
        panelTitle.textContent = 'מדינות';
        turnDisplay.textContent = `תור ${gameState.turn}`;
        endTurnBtn.textContent = 'סיים תור';
        restartGameBtn.textContent = 'אפס משחק';
    } else if (currentLanguage === 'ar') {
        panelTitle.textContent = 'بلدان';
        turnDisplay.textContent = `الدور ${gameState.turn}`;
        endTurnBtn.textContent = 'إنهاء الدور';
        restartGameBtn.textContent = 'إعادة تعيين';
    } else {
        panelTitle.textContent = 'Countries';
        turnDisplay.textContent = `Turn ${gameState.turn}`;
        endTurnBtn.textContent = 'End Turn';
        restartGameBtn.textContent = 'Restart Game';
    }

    const sortedCountries = [
        countries.find(c => c.id === 'israel'),
        ...countries.filter(c => c.id !== 'israel')
    ];
    
    sortedCountries.forEach(country => {
        const isIsrael = country.id === 'israel';
        const li = document.createElement('li');
        li.className = 'country-list-item';
        
        let displayStatus = '';
        if (isIsrael) {
            displayStatus = '⭐';
        } else {
            const diplomacyStatus = gameState.diplomacy[country.id] || 'neutral';
            if (diplomacyStatus === 'peace') displayStatus = '🤝';
            else if (diplomacyStatus === 'war') displayStatus = '⚔️';
            else if (diplomacyStatus === 'hostile') displayStatus = '🔥';
            else displayStatus = '❌';
        }

        li.innerHTML = `<span class="country-list-name">${getCountryFlagHtml(country.id, 'sm')}<span>${country.name[currentLanguage]}</span></span> <span style="font-size: 14px; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.8));">${displayStatus}</span>`;
        
        li.addEventListener('mouseenter', () => {
            openContextMenu(country, li);
        });
        
        li.addEventListener('mouseleave', () => {
            scheduleCloseContextMenu();
        });

        li.addEventListener('click', (event) => {
            event.stopPropagation();
            focusCountryOnMap(country);
            openContextMenu(country, li);
        });
        
        listEl.appendChild(li);
    });
}

let closeMenuTimeout;
const contextMenu = document.getElementById('country-context-menu');
const battlePowerPanel = document.getElementById('battle-power-panel');
const israelDiplomacyPanel = document.getElementById('israel-diplomacy-panel');
const israelDiplomacyList = document.getElementById('israel-diplomacy-list');
const israelDiplomacyTitle = document.getElementById('israel-diplomacy-title');
const israelDiplomacySubtitle = document.getElementById('israel-diplomacy-subtitle');
const israelDiplomacyClose = document.getElementById('israel-diplomacy-close');
let selectedWarTactic = 'attach_all_power';
let suppressDiplomacyOutsideClose = false;

function isMobileViewport() {
    return window.matchMedia('(max-width: 900px)').matches;
}

function focusCountryOnMap(country) {
    if (!country?.coords) return;
    const smallAreas = new Set(['gaza_strip', 'bahrain', 'qatar', 'kuwait', 'lebanon', 'israel']);
    const zoom = smallAreas.has(country.id) ? 8 : 7;
    map.flyTo(country.coords, zoom, {
        duration: 1.2,
        easeLinearity: 0.25
    });
}

function getDiplomacyStatusMeta(diplomacyStatus) {
    if (diplomacyStatus === 'peace') {
        return {
            text: currentLanguage === 'he' ? 'שלום' : (currentLanguage === 'ar' ? 'سلام' : 'Peace'),
            className: 'status-peace',
            icon: '🤝'
        };
    }
    if (diplomacyStatus === 'war') {
        return {
            text: currentLanguage === 'he' ? 'במלחמה' : (currentLanguage === 'ar' ? 'في حرب' : 'At War'),
            className: 'status-war',
            icon: '⚔️'
        };
    }
    if (diplomacyStatus === 'hostile') {
        return {
            text: currentLanguage === 'he' ? 'מצב מלחמה' : (currentLanguage === 'ar' ? 'حالة حرب' : 'War Condition'),
            className: 'status-war',
            icon: '🔥'
        };
    }
    if (diplomacyStatus === 'conquered') {
        return {
            text: currentLanguage === 'he' ? 'נכבש' : (currentLanguage === 'ar' ? 'محتل' : 'Conquered'),
            className: 'status-moderate',
            icon: '🏳️'
        };
    }
    return {
        text: currentLanguage === 'he' ? 'מתון' : (currentLanguage === 'ar' ? 'معتدل' : 'Moderate'),
        className: 'status-moderate',
        icon: '❌'
    };
}

function localizeDiplomacyPanelCopy() {
    if (!israelDiplomacyTitle || !israelDiplomacySubtitle) return;
    if (currentLanguage === 'he') {
        israelDiplomacyTitle.textContent = 'דיפלומטיה — ישראל';
        israelDiplomacySubtitle.textContent = 'בחרו מדינה, ואז הכרזת מלחמה או הצעת שלום.';
    } else if (currentLanguage === 'ar') {
        israelDiplomacyTitle.textContent = 'الدبلوماسية — إسرائيل';
        israelDiplomacySubtitle.textContent = 'اختر دولة ثم أعلن الحرب أو اعرض السلام.';
    } else {
        israelDiplomacyTitle.textContent = 'Israel Diplomacy';
        israelDiplomacySubtitle.textContent = 'Choose a country, then declare war or offer peace.';
    }
}

function renderIsraelDiplomacyPanel() {
    if (!israelDiplomacyList) return;
    localizeDiplomacyPanelCopy();
    israelDiplomacyList.innerHTML = '';

    const actionPlaceholder = currentLanguage === 'he'
        ? 'בחר פעולה'
        : (currentLanguage === 'ar' ? 'اختر إجراءً' : 'Choose action');
    const declareLabel = currentLanguage === 'he'
        ? 'הכרז מלחמה'
        : (currentLanguage === 'ar' ? 'إعلان الحرب' : 'Declare War');
    const peaceLabel = currentLanguage === 'he'
        ? 'הצע שלום'
        : (currentLanguage === 'ar' ? 'عرض السلام' : 'Offer Peace');

    countries
        .filter(c => c.id !== 'israel')
        .forEach(country => {
            const diplomacyStatus = gameState.diplomacy[country.id] || 'neutral';
            const meta = getDiplomacyStatusMeta(diplomacyStatus);
            const isAtWar = diplomacyStatus === 'war';
            const isAtPeace = diplomacyStatus === 'peace';
            const canDeclare = !isAtWar && !gameState.warDeclaredThisTurn && diplomacyStatus !== 'conquered';
            const canOfferPeace = !isAtPeace && !gameState.warDeclaredThisTurn && diplomacyStatus !== 'conquered';

            const li = document.createElement('li');
            li.className = 'israel-diplomacy-row';
            li.innerHTML = `
                <span class="israel-diplomacy-name">${getCountryFlagHtml(country.id, 'md')}<span>${meta.icon} ${country.name[currentLanguage]}</span></span>
                <span class="israel-diplomacy-status ${meta.className}">${meta.text}</span>
                <select class="israel-diplomacy-action" data-country-id="${country.id}" ${(!canDeclare && !canOfferPeace) ? 'disabled' : ''}>
                    <option value="">${actionPlaceholder}</option>
                    <option value="declare-war" ${canDeclare ? '' : 'disabled'}>${declareLabel}</option>
                    <option value="offer-peace" ${canOfferPeace ? '' : 'disabled'}>${peaceLabel}</option>
                </select>
            `;

            const select = li.querySelector('select');
            select.addEventListener('change', () => {
                const action = select.value;
                select.value = '';
                if (action === 'declare-war') {
                    closeIsraelDiplomacyPanel();
                    declareWar(country);
                } else if (action === 'offer-peace') {
                    closeIsraelDiplomacyPanel();
                    offerPeace(country);
                }
            });

            israelDiplomacyList.appendChild(li);
        });
}

function openIsraelDiplomacyPanel() {
    if (!israelDiplomacyPanel) return;
    closeContextMenuImmediately();
    hideBattlePowerPanel();
    renderIsraelDiplomacyPanel();
    israelDiplomacyPanel.style.display = 'flex';
    israelDiplomacyPanel.setAttribute('aria-hidden', 'false');
    // Ignore the same click that opened the panel (map/list) so it does not close immediately.
    suppressDiplomacyOutsideClose = true;
    setTimeout(() => {
        suppressDiplomacyOutsideClose = false;
    }, 0);
    setTimeout(() => israelDiplomacyPanel.classList.add('visible'), 10);
}

function closeIsraelDiplomacyPanel() {
    if (!israelDiplomacyPanel) return;
    israelDiplomacyPanel.classList.remove('visible');
    israelDiplomacyPanel.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
        if (!israelDiplomacyPanel.classList.contains('visible')) {
            israelDiplomacyPanel.style.display = 'none';
        }
    }, 200);
}

if (israelDiplomacyClose) {
    israelDiplomacyClose.addEventListener('click', (event) => {
        event.stopPropagation();
        closeIsraelDiplomacyPanel();
    });
}

if (israelDiplomacyPanel) {
    L.DomEvent.disableClickPropagation(israelDiplomacyPanel);
    L.DomEvent.disableScrollPropagation(israelDiplomacyPanel);
}

contextMenu.addEventListener('mouseenter', () => {
    clearTimeout(closeMenuTimeout);
});

contextMenu.addEventListener('mouseleave', () => {
    scheduleCloseContextMenu();
});

contextMenu.addEventListener('click', (event) => {
    if (event.target && event.target.classList.contains('context-menu-close')) {
        closeContextMenuImmediately();
    }
});

if (battlePowerPanel) {
    battlePowerPanel.addEventListener('click', (event) => {
        if (event.target && event.target.classList.contains('battle-power-close')) {
            hideBattlePowerPanel();
        }
    });
}

function hideBattlePowerPanel() {
    if (!battlePowerPanel) return;
    battlePowerPanel.classList.remove('visible');
    setTimeout(() => {
        if (!battlePowerPanel.classList.contains('visible')) {
            battlePowerPanel.style.display = 'none';
            battlePowerPanel.innerHTML = '';
        }
    }, 220);
}

function renderWarTacticOptions() {
    const options = [
        { value: 'attach_all_power', label: 'Attach in all power' },
        { value: 'defend', label: 'Defend' },
        { value: 'withdrawl', label: 'Withdrawl' }
    ];

    return `
        <div class="battle-tactics-group">
            <div class="battle-tactics-title">War Tactic</div>
            ${options.map(option => `
                <label class="battle-tactic-option">
                    <input
                        type="radio"
                        name="war-tactic"
                        value="${option.value}"
                        ${selectedWarTactic === option.value ? 'checked' : ''}
                    />
                    <span>${option.label}</span>
                </label>
            `).join('')}
        </div>
    `;
}

async function showBattlePowerPanel(country) {
    if (!battlePowerPanel || !country || country.id === 'israel') return;
    battlePowerPanel.classList.remove('visible');
    battlePowerPanel.style.display = 'block';
    battlePowerPanel.innerHTML = `
        <button class="battle-power-close" aria-label="Close">x</button>
        <div class="battle-power-title">Balance of Power</div>
        <div>Loading...</div>
        ${renderWarTacticOptions()}
    `;

    try {
        const response = await fetch('/api/resolve-battle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                attackerId: 'israel',
                defenderId: country.id,
                startedBy: 'israel'
            }),
            ...withCredentials
        });
        if (goToLoginIfUnauthorized(response)) return;
        const payload = await response.json();
        if (!response.ok || !payload.success || !payload.result) {
            throw new Error(payload.error || 'Could not resolve battle');
        }

        const result = payload.result;
        const attackerScore = Number(result.attacker.score) || 0;
        const defenderScore = Number(result.defender.score) || 0;
        const total = attackerScore + defenderScore;
        const attackerPct = total > 0 ? (attackerScore / total) * 100 : 50;
        const defenderPct = total > 0 ? (defenderScore / total) * 100 : 50;
        const winnerLabel = result.winner === 'draw'
            ? 'Predicted result: Draw'
            : `Predicted winner: ${result.winner}`;

        battlePowerPanel.innerHTML = `
            <button class="battle-power-close" aria-label="Close">x</button>
            <div class="battle-power-title">Balance of Power</div>
            <div class="battle-power-row">
                <div class="battle-power-label"><span class="battle-power-side">${getCountryFlagHtml('israel', 'sm')}<span>Israel</span></span><span>${attackerPct.toFixed(1)}%</span></div>
                <div class="battle-power-bar"><div class="battle-power-fill attacker" style="width: ${attackerPct.toFixed(1)}%;"></div></div>
            </div>
            <div class="battle-power-row">
                <div class="battle-power-label"><span class="battle-power-side">${getCountryFlagHtml(country.id, 'sm')}<span>${country.name[currentLanguage]}</span></span><span>${defenderPct.toFixed(1)}%</span></div>
                <div class="battle-power-bar"><div class="battle-power-fill defender" style="width: ${defenderPct.toFixed(1)}%;"></div></div>
            </div>
            <div class="battle-power-winner">${winnerLabel}</div>
            ${renderWarTacticOptions()}
        `;
    } catch (err) {
        battlePowerPanel.innerHTML = `
            <button class="battle-power-close" aria-label="Close">x</button>
            <div class="battle-power-title">Balance of Power</div>
            <div>Failed to load</div>
            ${renderWarTacticOptions()}
        `;
    }

    const tacticRadios = battlePowerPanel.querySelectorAll('input[name="war-tactic"]');
    tacticRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
            selectedWarTactic = radio.value;
        });
    });

    setTimeout(() => battlePowerPanel.classList.add('visible'), 10);
}

function openContextMenu(country, liElement) {
    clearTimeout(closeMenuTimeout);
    const menuTitle = document.getElementById('context-menu-title');
    const menuStatus = document.getElementById('context-menu-status');
    
    // Disable click propagation specifically for this menu instance
    L.DomEvent.disableClickPropagation(contextMenu);
    L.DomEvent.disableScrollPropagation(contextMenu);

    menuTitle.innerHTML = `${getCountryFlagHtml(country.id, 'md')}<span>${country.name[currentLanguage]}</span>`;
    const contextButtons = document.querySelector('.context-buttons');
    
    menuTitle.style.cursor = 'pointer';
    menuTitle.onclick = (event) => {
        event.stopPropagation();
        focusCountryOnMap(country);
        if (country.id === 'israel') {
            closeContextMenuImmediately();
            openIsraelDiplomacyPanel();
        }
    };

    if (country.id === 'israel') {
        menuStatus.style.display = 'none';
        contextButtons.style.display = 'none';
        // Diplomacy opens only from this floating Israel hover overlay.
        contextMenu.style.cursor = 'pointer';
        contextMenu.onclick = (event) => {
            if (event.target.closest('.context-menu-close')) return;
            if (event.target.closest('#context-menu-title')) return;
            closeContextMenuImmediately();
            openIsraelDiplomacyPanel();
        };
    } else {
        contextMenu.style.cursor = '';
        contextMenu.onclick = null;
        menuStatus.style.display = 'block';
        contextButtons.style.display = 'flex';
        
        const diplomacyStatus = gameState.diplomacy[country.id] || 'neutral';
        const meta = getDiplomacyStatusMeta(diplomacyStatus);
        const statusText = meta.text;
        const statusClass = meta.className;
        
        if (currentLanguage === 'he') menuStatus.textContent = `סטטוס: ${statusText}`;
        else if (currentLanguage === 'ar') menuStatus.textContent = `الحالة: ${statusText}`;
        else menuStatus.textContent = `Status: ${statusText}`;
        
        menuStatus.className = statusClass;
        
        const btnWar = document.getElementById('btn-declare-war');
        const btnPeace = document.getElementById('btn-offer-peace');
        
        if (currentLanguage === 'he') {
            btnWar.textContent = diplomacyStatus === 'war' ? 'במלחמה' : 'הכרז מלחמה';
            btnPeace.textContent = 'הצע שלום';
        } else if (currentLanguage === 'ar') {
            btnWar.textContent = diplomacyStatus === 'war' ? 'في حرب' : 'إعلان الحرب';
            btnPeace.textContent = 'عرض السلام';
        } else {
            btnWar.textContent = diplomacyStatus === 'war' ? 'At War' : 'Declare War';
            btnPeace.textContent = 'Offer Peace';
        }

        const isAtWar = diplomacyStatus === 'war';
        // Keep "At War" hoverable so we can show battle power panel.
        btnWar.disabled = gameState.warDeclaredThisTurn && !isAtWar;
        btnPeace.disabled = (diplomacyStatus === 'peace') || gameState.warDeclaredThisTurn;

        // Never allow war declaration click action when already at war.
        btnWar.onclick = null;
        btnPeace.onclick = null;
        if (!isAtWar && !gameState.warDeclaredThisTurn) {
            btnWar.onclick = () => {
                scheduleCloseContextMenu();
                declareWar(country);
            };
        }
        if (diplomacyStatus !== 'peace' && !gameState.warDeclaredThisTurn) {
            btnPeace.onclick = () => {
                scheduleCloseContextMenu();
                offerPeace(country);
            };
        }

        btnWar.onmouseenter = null;
        btnWar.onmouseleave = null;
        if (isAtWar) {
            btnWar.onclick = () => {
                contextMenu.classList.remove('visible');
                contextMenu.style.display = 'none';
                showBattlePowerPanel(country);
            };
        }
    }
    
    if (isMobileViewport()) {
        contextMenu.style.top = 'auto';
        contextMenu.style.left = '12px';
        contextMenu.style.right = '12px';
        contextMenu.style.bottom = '10px';
    } else {
        // Position menu to the left of the list item
        const liRect = liElement.getBoundingClientRect();
        const menuWidth = 140 + 24; // approx width + padding
        contextMenu.style.right = 'auto';
        contextMenu.style.bottom = 'auto';
        contextMenu.style.top = `${liRect.top}px`;
        contextMenu.style.left = `${liRect.left - menuWidth - 10}px`;
    }
    contextMenu.style.display = 'block';
    
    setTimeout(() => contextMenu.classList.add('visible'), 10);
}

function scheduleCloseContextMenu() {
    closeMenuTimeout = setTimeout(() => {
        contextMenu.classList.remove('visible');
        setTimeout(() => {
            if (!contextMenu.classList.contains('visible')) {
                contextMenu.style.display = 'none';
            }
        }, 200);
    }, 150);
}

function closeContextMenuImmediately() {
    clearTimeout(closeMenuTimeout);
    contextMenu.classList.remove('visible');
    contextMenu.style.display = 'none';
}

function declareWar(country) {
    if (gameState.warDeclaredThisTurn || gameState.diplomacy[country.id] === 'war') return;

    gameState.warDeclaredThisTurn = true;
    console.log(`Declaring war on ${country.id}`);

    // Slowly pan and zoom into the target country
    map.flyTo(country.coords, 7, {
        duration: 2.5,
        easeLinearity: 0.25
    });

    // Wait for the camera to finish moving before launching the barrage
    setTimeout(() => {
        animateAttack(country, () => {
            gameState.diplomacy[country.id] = 'war';
            saveState(); // persist war declaration to server
            updateLabels(); // this will also renderCountryList() giving us the new ⚔️ marker
        });
    }, 2500);
}

function offerPeace(country) {
    if (!country || country.id === 'israel') return;
    if (gameState.warDeclaredThisTurn || gameState.diplomacy[country.id] === 'peace') return;

    gameState.warDeclaredThisTurn = true;
    gameState.diplomacy[country.id] = 'peace';
    console.log(`Offering peace to ${country.id}`);
    saveState();
    updateLabels();
}

function animateAttack(targetCountry, callback) {
    const israel = countries.find(c => c.id === 'israel');
    const startPoint = map.latLngToLayerPoint(israel.coords);
    const endPoint = map.latLngToLayerPoint(targetCountry.coords);
    
    const isBordering = ['egypt', 'jordan', 'syria', 'lebanon', 'gaza_strip'].includes(targetCountry.id);
    
    // Top-down tank SVG facing right natively
    const tankSvg = `<svg viewBox="0 0 100 100" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="20" width="50" height="60" fill="#2d4a22" rx="5"/>
      <rect x="15" y="15" width="60" height="15" fill="#1b2e14" rx="2" />
      <rect x="15" y="70" width="60" height="15" fill="#1b2e14" rx="2" />
      <rect x="45" y="47" width="40" height="6" fill="#14220f" />
      <circle cx="45" cy="50" r="15" fill="#3f6630" />
    </svg>`;
    
    // Core payload - Missiles and Jets are fast
    const projectiles = [
        { isSvg: false, content: '🚀', speed: 2000, emojiOffset: 45 },
        { isSvg: false, content: '🚀', speed: 2000, emojiOffset: 45 },
        { isSvg: false, content: '🛩️', speed: 2200, emojiOffset: 45 },
        { isSvg: false, content: '🛩️', speed: 2200, emojiOffset: 45 }
    ];
    
    // Add slower moving tanks and soldiers if there is a land border
    if (isBordering) {
        projectiles.push(
            { isSvg: true, content: tankSvg, speed: 3500, emojiOffset: 0 },
            { isSvg: true, content: tankSvg, speed: 3500, emojiOffset: 0 },
            { isSvg: true, content: tankSvg, speed: 3800, emojiOffset: 0 },
            { isSvg: false, content: '🪖', speed: 4500, emojiOffset: 0 },
            { isSvg: false, content: '🪖', speed: 4500, emojiOffset: 0 },
            { isSvg: false, content: '🪖', speed: 4800, emojiOffset: 0 },
            { isSvg: false, content: '🪖', speed: 4800, emojiOffset: 0 }
        );
    }

    // Trajectory angle math
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    let maxSpeed = 0;
    
    projectiles.forEach((p, index) => {
        if (p.speed > maxSpeed) maxSpeed = p.speed;
        
        setTimeout(() => {
            const el = L.DomUtil.create('div', 'attack-emoji');
            if (p.isSvg) el.innerHTML = p.content;
            else el.textContent = p.content;
            
            const rotation = angle + p.emojiOffset;
            
            el.style.left = `${startPoint.x}px`;
            el.style.top = `${startPoint.y}px`;
            el.style.transform = `rotate(${rotation}deg) scale(0)`;
            el.style.transition = `left ${p.speed/1000}s linear, top ${p.speed/1000}s linear, transform 0.3s`;
            
            map.getPanes().overlayPane.appendChild(el);
            
            // Trigger layout reflow to process CSS transition
            el.getBoundingClientRect();
            
            el.style.transform = `rotate(${rotation}deg) scale(1)`;
            el.style.left = `${endPoint.x + (Math.random()*40-20)}px`;
            el.style.top = `${endPoint.y + (Math.random()*40-20)}px`;
            
            // Explode on impact
            setTimeout(() => {
                el.innerHTML = '💥';
                el.style.transform = `rotate(0deg) scale(2)`;
                setTimeout(() => el.remove(), 300);
            }, p.speed);
            
        }, index * 250); // Stagger launches
    });
    
    // Resolve callback when the last (slowest) projectile explodes
    setTimeout(() => {
        if(callback) callback();
    }, maxSpeed + (projectiles.length * 250) + 300);
}

async function restartGame() {
    const messages = {
        en: 'Are you sure you want to restart the game? All progress will be lost.',
        he: 'האם אתה בטוח שברצונך לאפס את המשחק? כל ההתקדמות תאבד.',
        ar: 'هل أنت متأكد أنك تريد إعادة تعيين اللعبة؟ ستفقد كل التقدم.'
    };
    
    if (confirm(messages[currentLanguage])) {
        try {
            const resp = await fetch('/api/reset-state', { method: 'POST', ...withCredentials });
            if (goToLoginIfUnauthorized(resp)) return;
            if (resp.ok) {
                const data = await resp.json();
                gameState = data.state;
                console.log('Game state reset successfully.');
                
                // Show newspaper again
                updateNewspaper();
                const newspaper = document.getElementById('newspaper-overlay');
                newspaper.style.display = 'flex';
                setTimeout(() => newspaper.style.opacity = '1', 10);
                
                // Refresh map and panel
                updateLabels();
                
                // Zoom back to default view
                map.flyTo(middleEastCenter, initialZoom, { duration: 1.5 });
            }
        } catch (e) {
            console.error('Failed to reset game:', e);
            alert('Error resetting game.');
        }
    }
}

document.getElementById('end-turn-btn').addEventListener('click', endTurn);
document.getElementById('restart-game-btn').addEventListener('click', restartGame);
document.getElementById('logout-btn').addEventListener('click', logout);
// -----------------------------------------------

// --- Init: Load state from server then boot the game ---
async function init() {
    try {
        const serverOk = await isAppServerReachable();
        if (!serverOk) {
            const hint = window.location.protocol === 'file:'
                ? 'Do not open index.html as a file. Run `npm start` and open http://localhost:3000'
                : 'Run `npm start` in the project folder and open http://localhost:3000 (not a static-only server on another port).';
            console.error('Game API not reachable.', hint);
            alert(hint);
            return;
        }
        await loadCurrentUser();
        const resp = await fetch('/api/game-state', withCredentials);
        if (resp.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (resp.ok) {
            const serverState = await resp.json();
            gameState.turn = serverState.turn;
            gameState.warDeclaredThisTurn = serverState.warDeclaredThisTurn;
            gameState.diplomacy = serverState.diplomacy;
            console.log('Game state loaded from server:', gameState);
        }
    } catch (e) {
        console.warn('Session or game load failed; sending you to login.', e);
        window.location.href = '/login';
        return;
    }
    updateLabels();
}

init();

// Restrict navigation to roughly the Middle East area
const southWest = L.latLng(10.0, 25.0);
const northEast = L.latLng(45.0, 65.0);
const bounds = L.latLngBounds(southWest, northEast);

map.setMaxBounds(bounds);
map.on('drag', function () {
    map.panInsideBounds(bounds, { animate: false });
});

// Pixel-offset war arrows must be rebuilt after zoom/pan.
map.on('zoomend moveend', () => {
    updateWarArrows();
});

// --- Draggable Panel ---
const listPanel = document.getElementById('country-list-panel');
const panelTitle = document.getElementById('panel-title');

L.DomEvent.disableClickPropagation(listPanel);
L.DomEvent.disableScrollPropagation(listPanel);

document.addEventListener('click', (event) => {
    if (!contextMenu.contains(event.target)) {
        closeContextMenuImmediately();
    }
    if (
        !suppressDiplomacyOutsideClose
        && israelDiplomacyPanel
        && israelDiplomacyPanel.classList.contains('visible')
        && !israelDiplomacyPanel.contains(event.target)
    ) {
        closeIsraelDiplomacyPanel();
    }
});

let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
panelTitle.onmousedown = function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
};

function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    listPanel.style.top = (listPanel.offsetTop - pos2) + "px";
    listPanel.style.left = (listPanel.offsetLeft - pos1) + "px";
    listPanel.style.right = "auto";
}

function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
}

console.log("Game Board Initialized: Leaflet 2D Map");

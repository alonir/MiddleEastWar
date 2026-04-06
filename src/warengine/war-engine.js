const fs = require("fs");
const path = require("path");

const RULES_PATH = path.join(__dirname, "war-rules.json");

function readDefaultWarRules() {
    const raw = fs.readFileSync(RULES_PATH, "utf-8");
    return JSON.parse(raw);
}

/**
 * @param {unknown} r
 * @returns {string | null} error message, or null if valid
 */
function validateWarRules(r) {
    if (!r || typeof r !== "object") {
        return "Rules must be a non-null object";
    }
    const { defaults, weights, modifiers, decision } = r;
    if (!defaults || typeof defaults !== "object") {
        return "Missing defaults object";
    }
    for (const k of ["attackerForcesPct", "defenderForcesPct"]) {
        const v = defaults[k];
        if (typeof v !== "number" || !Number.isFinite(v)) {
            return `defaults.${k} must be a finite number`;
        }
    }
    if (!weights || typeof weights !== "object") {
        return "Missing weights object";
    }
    for (const k of ["regularArmy", "reserves", "tanks", "aircraft", "navy", "submarines"]) {
        const v = weights[k];
        if (typeof v !== "number" || !Number.isFinite(v)) {
            return `weights.${k} must be a finite number`;
        }
    }
    if (!modifiers || typeof modifiers !== "object") {
        return "Missing modifiers object";
    }
    for (const k of [
        "warInitiatorBonus",
        "homeDefenseBonus",
        "overcommitPenaltyThreshold",
        "overcommitPenaltyMultiplier"
    ]) {
        const v = modifiers[k];
        if (typeof v !== "number" || !Number.isFinite(v)) {
            return `modifiers.${k} must be a finite number`;
        }
    }
    if (!decision || typeof decision !== "object") {
        return "Missing decision object";
    }
    if (typeof decision.drawMarginPct !== "number" || !Number.isFinite(decision.drawMarginPct)) {
        return "decision.drawMarginPct must be a finite number";
    }
    return null;
}

function parseNumber(value) {
    if (typeof value === "number") {
        return value;
    }
    if (!value) {
        return 0;
    }

    const normalized = String(value).trim().toLowerCase().replace(/,/g, "");
    if (normalized.endsWith("k")) {
        return Number(normalized.slice(0, -1)) * 1000;
    }
    if (normalized.endsWith("m")) {
        return Number(normalized.slice(0, -1)) * 1000000;
    }
    return Number(normalized);
}

function safePct(rawValue, fallback) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
        return fallback;
    }
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return value;
}

function computeBasePower(country, weights) {
    const stats = country.stats || {};
    return (
        parseNumber(stats.army_regular && stats.army_regular.en) * weights.regularArmy +
        parseNumber(stats.army_reserves && stats.army_reserves.en) * weights.reserves +
        parseNumber(stats.tanks && stats.tanks.en) * weights.tanks +
        parseNumber(stats.aircraft && stats.aircraft.en) * weights.aircraft +
        parseNumber(stats.navy && stats.navy.en) * weights.navy +
        parseNumber(stats.submarines && stats.submarines.en) * weights.submarines
    );
}

function resolveBattle(input, countries, rules) {
    const effectiveRules = rules || readDefaultWarRules();
    const attacker = countries.find((c) => c.id === input.attackerId);
    const defender = countries.find((c) => c.id === input.defenderId);

    if (!attacker || !defender) {
        throw new Error("Invalid attacker or defender country id.");
    }
    if (attacker.id === defender.id) {
        throw new Error("Attacker and defender must be different countries.");
    }

    const attackerPct = safePct(
        input.attackerForcesPct,
        effectiveRules.defaults.attackerForcesPct
    );
    const defenderPct = safePct(
        input.defenderForcesPct,
        effectiveRules.defaults.defenderForcesPct
    );

    const attackerBase = computeBasePower(attacker, effectiveRules.weights);
    const defenderBase = computeBasePower(defender, effectiveRules.weights);

    let attackerScore = attackerBase * attackerPct;
    let defenderScore = defenderBase * defenderPct;

    if (input.startedBy === attacker.id) {
        attackerScore *= effectiveRules.modifiers.warInitiatorBonus;
    } else if (input.startedBy === defender.id) {
        defenderScore *= effectiveRules.modifiers.warInitiatorBonus;
    }

    defenderScore *= effectiveRules.modifiers.homeDefenseBonus;

    if (attackerPct > effectiveRules.modifiers.overcommitPenaltyThreshold) {
        attackerScore *= effectiveRules.modifiers.overcommitPenaltyMultiplier;
    }
    if (defenderPct > effectiveRules.modifiers.overcommitPenaltyThreshold) {
        defenderScore *= effectiveRules.modifiers.overcommitPenaltyMultiplier;
    }

    const gap = attackerScore - defenderScore;
    const maxScore = Math.max(attackerScore, defenderScore);
    const margin = maxScore > 0 ? Math.abs(gap) / maxScore : 0;

    let winner = "draw";
    if (margin > effectiveRules.decision.drawMarginPct) {
        winner = gap > 0 ? attacker.id : defender.id;
    }

    return {
        winner,
        attacker: {
            id: attacker.id,
            score: Number(attackerScore.toFixed(2)),
            committedForcesPct: attackerPct
        },
        defender: {
            id: defender.id,
            score: Number(defenderScore.toFixed(2)),
            committedForcesPct: defenderPct
        },
        details: {
            startedBy: input.startedBy || null,
            rulesVersion: rules ? "database" : "file-default"
        }
    };
}

module.exports = { resolveBattle, validateWarRules, readDefaultWarRules };


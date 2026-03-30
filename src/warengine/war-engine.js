const fs = require("fs");
const path = require("path");

const RULES_PATH = path.join(__dirname, "war-rules.json");

function loadRules() {
    const raw = fs.readFileSync(RULES_PATH, "utf-8");
    return JSON.parse(raw);
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

function resolveBattle(input, countries) {
    const rules = loadRules();
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
        rules.defaults.attackerForcesPct
    );
    const defenderPct = safePct(
        input.defenderForcesPct,
        rules.defaults.defenderForcesPct
    );

    const attackerBase = computeBasePower(attacker, rules.weights);
    const defenderBase = computeBasePower(defender, rules.weights);

    let attackerScore = attackerBase * attackerPct;
    let defenderScore = defenderBase * defenderPct;

    if (input.startedBy === attacker.id) {
        attackerScore *= rules.modifiers.warInitiatorBonus;
    } else if (input.startedBy === defender.id) {
        defenderScore *= rules.modifiers.warInitiatorBonus;
    }

    defenderScore *= rules.modifiers.homeDefenseBonus;

    if (attackerPct > rules.modifiers.overcommitPenaltyThreshold) {
        attackerScore *= rules.modifiers.overcommitPenaltyMultiplier;
    }
    if (defenderPct > rules.modifiers.overcommitPenaltyThreshold) {
        defenderScore *= rules.modifiers.overcommitPenaltyMultiplier;
    }

    const gap = attackerScore - defenderScore;
    const maxScore = Math.max(attackerScore, defenderScore);
    const margin = maxScore > 0 ? Math.abs(gap) / maxScore : 0;

    let winner = "draw";
    if (margin > rules.decision.drawMarginPct) {
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
            rulesVersion: "v1"
        }
    };
}

module.exports = { resolveBattle };


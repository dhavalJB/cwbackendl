const weightConfig = {
  TITAN_STRIKE: {
    type: "attack",
    key: "Titan's Strike",
    stats: ["attack", "powers"],
    weights: {
      attack: 1.0,
      armor: 0,
      agility: 0,
      intelligence: 0,
      powers: 0.3,
      vitality: 0,
    },
  },
  BERSERKERS_FURY: {
    type: "attack",
    key: "Berserkers Fury",
    stats: ["powers", "attack"],
    weights: {
      attack: 0.5,
      armor: 0,
      agility: 0,
      intelligence: 0,
      powers: 1.0,
      vitality: 0,
    },
  },
  MIND_WRAP: {
    type: "attack",
    key: "Mind Wrap",
    stats: ["intelligence"],
    weights: {
      attack: 0,
      armor: 0,
      agility: 0,
      intelligence: 1.0,
      powers: 0,
      vitality: 0,
    },
  },
  TWIN_STRIKE: {
    type: "attack",
    key: "Twin Strike",
    stats: ["attack", "agility"],
    weights: {
      attack: 0.8,
      armor: 0,
      agility: 0.3,
      intelligence: 0,
      powers: 0,
      vitality: 0,
    },
  },
  SOUL_LEECH: {
    type: "attack",
    key: "Soul Leech",
    stats: ["intelligence", "powers"],
    weights: {
      attack: 0,
      armor: 0,
      agility: 0,
      intelligence: 0.7,
      powers: 0.3,
      vitality: 0,
    },
  },
  FURY_UNLEASHED: {
    type: "attack",
    key: "Fury Unleashed",
    stats: ["attack", "vitality"],
    weights: {
      attack: 0.7,
      armor: 0,
      agility: 0,
      intelligence: 0,
      powers: 0,
      vitality: 0.3,
    },
  },
  AEGIS_WARD: {
    type: "defense",
    key: "Aegis Ward",
    stats: ["armor", "vitality"],
    weights: {
      attack: 0,
      armor: 0.7,
      agility: 0,
      intelligence: 0,
      powers: 0,
      vitality: 0.3,
    },
  },
  CELESTIAL_REJUVENATION: {
    type: "defense",
    key: "Celestial Rejuvenation",
    stats: ["vitality", "agility"],
    weights: {
      attack: 0,
      armor: 0,
      agility: 0.4,
      intelligence: 0,
      powers: 0,
      vitality: 0.6,
    },
  },
  GUARDIANS_BULWARK: {
    type: "defense",
    key: "Guardian's Bulwark",
    stats: ["armor"],
    weights: {
      attack: 0,
      armor: 1.0,
      agility: 0,
      intelligence: 0,
      powers: 0,
      vitality: 0,
    },
  },
  ARCANE_OVERCHARGE: {
    type: "defense",
    key: "Arcane Overcharge",
    stats: ["vitality", "intelligence"],
    weights: {
      attack: 0,
      armor: 0,
      agility: 0,
      intelligence: 0.7,
      powers: 0,
      vitality: 0.3,
    },
  },
};

const MAX_LEVEL = 10;

/**
 * Returns scaled ability weights for a given ability and level
 * @param {string} abilityKey - e.g., "TITAN_STRIKE"
 * @param {number} level - 1 to 10
 * @returns {object} scaledWeights - { attack, armor, agility, intelligence, powers, vitality }
 */
function getAbilityWeights(abilityKey, level = 1) {
  if (!weightConfig[abilityKey]) {
    throw new Error(`Ability "${abilityKey}" not found in weightConfig`);
  }

  const baseWeights = weightConfig[abilityKey].weights;
  const multiplier = Math.min(Math.max(level, 1), MAX_LEVEL) / MAX_LEVEL;

  const scaledWeights = {};
  for (const stat of Object.keys(baseWeights)) {
    scaledWeights[stat] = baseWeights[stat] * multiplier;
  }

  return scaledWeights;
}

const abilityNameMap = {
  "Berserkers Fury": "berserkers_fury",
  "Aegis Ward": "aegis_ward",
  "Arcane Overcharge": "arcane_overcharge",
  "Celestial Rejuvenation": "celestial_rejuvenation",
  "Guardian's Bulwark": "guardians_bulwark",
  "Mind Wrap": "mindwrap",
  "Soul Leech": "soul_leech",
  "Titan's Strike": "titan_strike",
  "Twin Strike": "twin_strike",
  "Fury Unleashed": "fury_unleashed",
  "Drop Animation": null,
};

const defaultWeights = {
  attack: 0,
  armor: 0,
  agility: 0,
  intelligence: 0,
  powers: 0,
  vitality: 0,
};

module.exports = {
  weightConfig,
  abilityNameMap,
  defaultWeights,
  getAbilityWeights,
  MAX_LEVEL,
};

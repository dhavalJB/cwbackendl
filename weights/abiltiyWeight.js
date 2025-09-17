const weightConfig = {
  titan_strike: {
    type: "attack",
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
  berserkers_fury: {
    type: "attack",
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
  mindwrap: {
    type: "attack",
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
  twin_strike: {
    type: "attack",
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
  soul_leech: {
    type: "attack",
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
  fury_unleashed: {
    type: "attack",
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
  aegis_ward: {
    type: "defense",
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
  celestial_rejuvenation: {
    type: "defense",
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
  guardians_bulwark: {
    type: "defense",
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
  arcane_overcharge: {
    type: "defense",
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

module.exports = { weightConfig, abilityNameMap, defaultWeights };

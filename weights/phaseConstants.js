const PHASES = [
  "cooldown",
  "selection",
  "battle",
  "selection",
  "battle",
  "selection",
  "battle",
  "selection",
  "battle",
  "finished",
];

const BASE_TIMERS = {
  cooldown: 5000,
  selection: 10000,
  battle: 5000,
  finished: 5000,
};

const TUTORIAL_TIMERS = {
  cooldown: 16000,
  selection: 22000,
  battle: 3000,
  finished: 10000,
};

/**
 * PHASE_TIMERS object keeps the same name but returns correct timer
 * @param {string} phase
 * @param {number} round
 * @param {string} timersType - 'normal' | 'tutorial'
 */
const PHASE_TIMERS = {
  get: (phase, round, timersType = "normal") => {
    // Apply tutorial timers only for rounds 1 or 2
    if (timersType === "tutorial" && round === 0) {
      return TUTORIAL_TIMERS[phase] ?? BASE_TIMERS[phase];
    }
    return BASE_TIMERS[phase];
  },
};

module.exports = { PHASES, PHASE_TIMERS };

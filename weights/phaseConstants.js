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

const PHASE_TIMERS = {
  cooldown: 5000,
  selection: 10000,
  battle: 5000,
  finished: 5000,
};

module.exports = { PHASES, PHASE_TIMERS };

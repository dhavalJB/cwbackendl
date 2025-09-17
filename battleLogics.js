// battleLogic.js
const admin = require('firebase-admin');
const db = admin.database();
const { weightConfig, abilityNameMap, defaultWeights } = require('./weights/abiltiyWeight');

/**
 * Get ability weights from displayName
 */
function getAbilityWeights(displayName) {
  const key = abilityNameMap[displayName];
  if (!key) return defaultWeights;
  return weightConfig[key]?.weights || defaultWeights;
}

/**
 * Calculate damage from attack weights vs defense weights
 */
function calculateDamage(attackWeights, defenseWeights) {
  return {
    attack: Math.max((attackWeights.attack || 0) - (defenseWeights.armor || 0), 0),
    agility: Math.max((attackWeights.agility || 0) - (defenseWeights.agility || 0), 0),
    intelligence: Math.max((attackWeights.intelligence || 0) - (defenseWeights.intelligence || 0), 0),
    powers: Math.max((attackWeights.powers || 0) - (defenseWeights.powers || 0), 0),
    vitality: Math.max((attackWeights.vitality || 0) - (defenseWeights.vitality || 0), 0)
  };
}

/**
 * Sum all values in damage object to get synergy points
 */
function sumDamage(damage) {
  return Object.values(damage).reduce((acc, val) => acc + val, 0);
}

/**
 * Update user synergy in Firebase
 */
async function updateUserSynergy(userRef, addedSynergy) {
  const snap = await userRef.once('value');
  const user = snap.val();
  if (!user) return;

  const newSynergy = (user.synergy || 0) + addedSynergy;
  await userRef.update({ synergy: newSynergy });
}

/**
 * Main battle resolution
 * Handles all 4 cases:
 * 1. Both selected ability
 * 2. Only attacker selected ability
 * 3. Only defender selected ability
 * 4. Neither selected ability
 */
async function resolveBattle(matchId) {
  const matchRef = db.ref(`ongoingBattles/${matchId}`);
  const snap = await matchRef.once('value');
  const match = snap.val();
  if (!match) return;

  const { player1, player2 } = match;

  // Both players must have selected a card
  if (!player1.selectedCard && !player2.selectedCard) return;

  // Ability weights, fallback to default (no ability selected)
  const attackerAbilityWeights = player1.selectedAbility
    ? getAbilityWeights(player1.selectedAbility)
    : defaultWeights;

  const defenderAbilityWeights = player2.selectedAbility
    ? getAbilityWeights(player2.selectedAbility)
    : defaultWeights;

  let damage = { attack: 0, agility: 0, intelligence: 0, powers: 0, vitality: 0 };

  // Case 1: attacker selected card & ability, defender selected card & ability
  if (player1.selectedCard && player1.selectedAbility && player2.selectedCard && player2.selectedAbility) {
    damage = calculateDamage(attackerAbilityWeights, defenderAbilityWeights);
  }
  // Case 2: attacker selected card & ability, defender only card
  else if (player1.selectedCard && player1.selectedAbility && player2.selectedCard && !player2.selectedAbility) {
    damage = calculateDamage(attackerAbilityWeights, defaultWeights);
  }
  // Case 3: attacker selected only card (no ability), defender selected card & ability
  else if (player1.selectedCard && !player1.selectedAbility && player2.selectedCard && player2.selectedAbility) {
    damage = calculateDamage({ attack: 1, agility: 0, intelligence: 0, powers: 0, vitality: 0 }, defenderAbilityWeights);
  }
  // Case 4: attacker selected only card, defender only card
  else if (player1.selectedCard && !player1.selectedAbility && player2.selectedCard && !player2.selectedAbility) {
    damage = calculateDamage({ attack: 1, agility: 0, intelligence: 0, powers: 0, vitality: 0 }, defaultWeights);
  }

  // Total synergy points
  const addedSynergy = sumDamage(damage);

  // Update both players synergy if applicable
  const player1Ref = matchRef.child('player1');
  const player2Ref = matchRef.child('player2');

  await updateUserSynergy(player2Ref, addedSynergy); // attacker deals damage to defender
  // Optionally, if defender has counter-attack logic, you can also calculate reverse

  console.log(`[Match ${matchId}] Damage resolved:`, damage, 'Synergy added:', addedSynergy);
}

// ---- Export ----
module.exports = {
  resolveBattle,
  calculateDamage,
  getAbilityWeights
};

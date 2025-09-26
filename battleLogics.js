// battleLogics.js
const { db } = require("./firebase");
const { weightConfig } = require("./weights/abilityWeights");

/**
 * Get the weightConfig key from ability name
 * @param {string} abilityName
 */
function getAbilityKey(abilityName) {
  if (!abilityName) return null;
  const key = Object.keys(weightConfig).find(
    (k) => weightConfig[k].key === abilityName
  );
  return key || null;
}

/**
 * Prepare player battle data for formula calculation
 */
function getPlayerBattleData(player) {
  const round = player.currentRound || {};
  const abilityKey = getAbilityKey(round.abilitySelected);

  return {
    userId: player.userId,
    synergy: player.synergy || 0,
    stats: round.stats || {
      attack: 0,
      armor: 0,
      agility: 0,
      intelligence: 0,
      powers: 0,
      vitality: 0,
    },
    abilitySelected: round.abilitySelected || null,
    abilityKey: abilityKey,
    abilityWeights: abilityKey ? weightConfig[abilityKey].weights : null,
  };
}

/**
 * Calculate damage from attacker -> defender
 * - Level 1 only
 * - Max 30% of defender synergy if both card + ability selected
 * - Damage only applied to defender role
 */
function calculateDamage(attacker, defender) {
  const attackerHasCard = attacker.stats && Object.keys(attacker.stats).length > 0;
  const attackerHasAbility = !!attacker.abilityKey;
  if (!attackerHasCard) return 0; // no card = 0 damage

  const defenderStats = defender.stats || {
    attack: 0,
    armor: 0,
    agility: 0,
    intelligence: 0,
    powers: 0,
    vitality: 0,
  };
  const defenderHasCard = defenderStats && Object.keys(defenderStats).length > 0;
  const defenderHasAbility = !!defender.abilityKey;

  // Base attack power
  let attackPower = 0;
  for (const stat in attacker.stats) {
    let statValue = attacker.stats[stat];
    if (attackerHasAbility) {
      const weight = attacker.abilityWeights[stat] || 0;
      statValue = statValue * (1 + weight);
    }
    attackPower += statValue;
  }

  // Base defense power
  let defensePower = 0;
  for (const stat in defenderStats) {
    let statValue = defenderStats[stat];
    if (defenderHasAbility) {
      const weight = defender.abilityWeights[stat] || 0;
      statValue = statValue * (1 + weight);
    }
    defensePower += statValue;
  }

  const MAX_DAMAGE_PERCENT = attackerHasAbility ? 0.3 : 0.15; // card only 15%, card+ability 30%
  let damage = attackPower - (defenderHasCard ? defensePower / 2 : 0);
  damage = Math.max(damage, 0);
  damage = Math.min(damage, Math.floor(defender.synergy * MAX_DAMAGE_PERCENT));

  return Math.round(damage);
}

/**
 * Single exported function to execute battle phase for a match
 * Fetches match data, calculates damage, updates defender synergy, logs everything
 */
async function executeBattlePhase(matchId) {
  try {
    const matchRef = db.ref(`ongoingBattles/${matchId}`);
    const snap = await matchRef.get();
    if (!snap.exists()) return;

    const matchData = snap.val();
    const { player1, player2 } = matchData;
    if (!player1 || !player2) return;

    const p1Data = getPlayerBattleData(player1);
    const p2Data = getPlayerBattleData(player2);

    // Determine roles
    const attacker = player1.currentRole === "attack" ? p1Data : p2Data;
    const defender = player1.currentRole === "attack" ? p2Data : p1Data;

    // Damage only applied to defender
    const damage = calculateDamage(attacker, defender);

    console.log(`[Match ${matchId}] Battle Phase:`);
    console.log(`${attacker.userId} -> ${defender.userId} : Damage = ${damage}`);

    // Update defender synergy in DB
    const updatedDefenderSynergy = Math.max(defender.synergy - damage, 0);
    const defenderRefPath =
      player1.currentRole === "attack" ? "player2/synergy" : "player1/synergy";
    await matchRef.child(defenderRefPath).set(updatedDefenderSynergy);

    console.log(
      `[Match ${matchId}] Updated Synergy: ${defender.userId} = ${updatedDefenderSynergy}`
    );

    return {
      attackerId: attacker.userId,
      defenderId: defender.userId,
      damage,
      updatedDefenderSynergy,
    };
  } catch (err) {
    console.error(`[Match ${matchId}] -> Error in battle phase:`, err);
    return null;
  }
}

module.exports = executeBattlePhase;

// populateQueue.js
const { db } = require("./firebase");

// Generate random integer between min and max (inclusive)
const getRandomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Total number of users to simulate
const TOTAL_USERS = 1;

// Example user names
const userNames = Array.from(
  { length: TOTAL_USERS },
  (_, i) => `user_${i + 1}`
);

// Clear existing queue first
async function clearQueue() {
  await db.ref("matchmakingQueue").remove();
  console.log("Matchmaking queue cleared.");
}

// Populate queue with test users
async function populateQueue() {
  for (let i = 0; i < TOTAL_USERS; i++) {
    const userId = `user_${i + 1}`;
    const userName = userNames[i];
    const synergy = getRandomInt(430, 470); // Random synergy between 50–100

    await db.ref(`matchmakingQueue/${userId}`).set({
      userId,
      userName,
      synergy,
    });
    console.log(`Added ${userName} with synergy ${synergy}`);
  }
  console.log(`✅ Populated ${TOTAL_USERS} users in matchmakingQueue.`);
}

// Run script
(async () => {
  await clearQueue();
  await populateQueue();
  process.exit(0);
})();
